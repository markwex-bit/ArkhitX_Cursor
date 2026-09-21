Attribute VB_Name = "modMouseWheel"
'==================================================================================
' modMouseWheel  -  Mouse-wheel scrolling for frmCostbooks.
'
' Scrolls the body frame, and - when a multi-select filter has dropped its checkbox
' list - the ITEMS INSIDE THAT DROPDOWN instead.
'
' *** THIS IS A SUBCLASS OF ONE WINDOW, NOT A GLOBAL HOOK. THAT DISTINCTION IS THE
'     WHOLE POINT - SEE frmCostbooks' UserForm_Activate COMMENT. ***
' The version this replaces installed a WH_MOUSE_LL / WH_MOUSE hook, which handed
' VBA every mouse message on the thread - including the ones Excel pumps during a
' render - and took Excel down whenever a Stop/Reset orphaned it. What follows
' receives messages for the UserForm's OWN window only, and only WM_MOUSEWHEEL:
'
'   - nothing else in Excel routes through VBA code any more;
'   - HookWheel is idempotent, so no duplicate chain can build up (the old hook
'     looped forever when two of them chained into each other);
'   - Enabled = False during a render answers the "it fired mid-render, inside
'     ShowPreview's DoEvents" failure directly - the wheel is simply inert then.
'
' *** UnhookWheel MUST run before the form's window is destroyed. *** A subclass
' left in place points at a VBA thunk that no longer exists, and the next message
' to that window kills Excel. frmCostbooks calls it from BOTH QueryClose and
' Terminate, and TpcReset calls it as a rescue. That is three chances to get it
' right; do not remove any of them.
'
' *** DO NOT PRESS STOP / RESET IN THE VBE WHILE THE FORM IS OPEN. *** That
' discards the thunk without restoring the window procedure, which is the one
' failure mode a subclass still shares with the old hook. Run TpcReset (which calls
' UnhookWheel) if it happens, and close the form before it is touched again.
'
' NB: keep each Declare on ONE physical line - a continuation in the declarations
' section makes the refresher's AddFromString inject a phantom "()" procedure.
' This module holds Declares, so modUpdateModules imports it when missing and then
' LEAVES IT ALONE; to update it, remove it in the VBE and re-import this file.
'==================================================================================
Option Explicit

' >>> KILL SWITCH. Set to False, re-import, Debug > Compile: the form then behaves
'     exactly as it did before wheel support existed (scrollbar only, no subclass
'     installed at all). Change this before doing anything clever if the wheel ever
'     misbehaves again - a working tool without the wheel beats a frozen one.
Private Const WHEEL_ENABLED As Boolean = True

Private Const GWL_WNDPROC As Long = -4
Private Const WM_MOUSEWHEEL As Long = &H20A
Private Const WM_VSCROLL As Long = &H115
Private Const SB_LINEUP As Long = 0
Private Const SB_LINEDOWN As Long = 1
Private Const SB_ENDSCROLL As Long = 8
Private Const WHEEL_NOTCH As Long = 120         ' one detent, per Windows

' How far one detent moves each kind of target.
Private Const FRAME_STEP_PT As Single = 42      ' ~3 text lines - the ScrollTop fallback
Private Const FRAME_STEP_LINES As Long = 3      ' the Windows default, for the native path
Private Const LIST_STEP_ROWS As Long = 3        ' the Windows default for lists

Private Declare PtrSafe Function FindWindowA Lib "user32" (ByVal lpClassName As String, ByVal lpWindowName As String) As LongPtr
Private Declare PtrSafe Function IsWindow Lib "user32" (ByVal hwnd As LongPtr) As Long
Private Declare PtrSafe Function IsChild Lib "user32" (ByVal hWndParent As LongPtr, ByVal hwnd As LongPtr) As Long
Private Declare PtrSafe Function CallWindowProcA Lib "user32" (ByVal lpPrevWndFunc As LongPtr, ByVal hwnd As LongPtr, ByVal msg As Long, ByVal wParam As LongPtr, ByVal lParam As LongPtr) As LongPtr
Private Declare PtrSafe Function DefWindowProcA Lib "user32" (ByVal hwnd As LongPtr, ByVal msg As Long, ByVal wParam As LongPtr, ByVal lParam As LongPtr) As LongPtr
Private Declare PtrSafe Function SendMessageA Lib "user32" (ByVal hwnd As LongPtr, ByVal msg As Long, ByVal wParam As LongPtr, ByVal lParam As LongPtr) As LongPtr

' SetWindowLongPtrA exists only in the 64-bit user32. A 32-bit Office must call
' SetWindowLongA, and pointer-width is what makes the difference - not VBA7.
'
' WindowFromPoint is the other one that cannot be declared once for both. It takes a
' POINT *BY VALUE*: two Longs pushed on the stack under x86, but a single packed
' 8-byte value in one register under x64. Declaring the x86 form on 64-bit Office
' would read the y coordinate out of the wrong place and return a garbage handle, so
' the two are genuinely different functions from VBA's side.
#If Win64 Then
    Private Declare PtrSafe Function SetWindowLongPtrA Lib "user32" (ByVal hwnd As LongPtr, ByVal nIndex As Long, ByVal dwNewLong As LongPtr) As LongPtr
    Private Declare PtrSafe Function WindowFromPoint Lib "user32" (ByVal Point As LongLong) As LongPtr
#Else
    Private Declare PtrSafe Function SetWindowLongA Lib "user32" (ByVal hwnd As LongPtr, ByVal nIndex As Long, ByVal dwNewLong As Long) As Long
    Private Declare PtrSafe Function WindowFromPoint Lib "user32" (ByVal xPoint As Long, ByVal yPoint As Long) As LongPtr
#End If

'---------------------------------- state --------------------------------------
Private mHwnd As LongPtr            ' the subclassed UserForm window (0 = not hooked)
Private mPrevProc As LongPtr        ' its original window procedure - restore EXACTLY
Private mPage As Object             ' base target: the scrollable body frame
Private mList As Object             ' override target: an open dropdown's ListBox
Private mEnabled As Boolean         ' False while a render owns the form

' *** THE RE-ENTRANCY GUARD. WITHOUT IT THE FORM FREEZES. ***
' Assigning ScrollTop / TopIndex makes MSForms scroll and repaint, and MSForms pumps
' messages while it does. If the user is still spinning the wheel, the NEXT queued
' WM_MOUSEWHEEL is then dispatched into this same procedure while VBA is still
' executing the previous call. VBA cannot re-enter its own procedure: it stalls, and
' every further notch deepens the nesting until the form stops responding to the
' wheel, then to clicks, then to the close button - with no error and nothing in the
' trace, because VBA never gets far enough to raise one.
'
' The first version of this module had no guard and did exactly that.
'
' *** THE ACCUMULATOR IS WHY SCROLLING IS SMOOTH RATHER THAN MERELY SAFE. ***
' The second version guarded correctly but PASSED the re-entrant notches through,
' i.e. threw them away. One notch = one repaint of the whole body frame, and that
' frame holds the full-width chart images, so a burst of notches meant several slow
' repaints with some of the spin silently lost - scrolling that lagged, stalled, then
' jumped.
'
' So a re-entrant notch is now ADDED TO mPending and consumed, and the call already
' in flight picks it up on its next loop. Nothing is dropped, nothing recurses, and a
' burst of N notches costs ONE repaint of their sum instead of N repaints.
Private mInProc As Boolean
Private mPending As Long            ' wheel delta accepted but not yet applied

' *** WHY THE FRAME IS SCROLLED THROUGH WM_VSCROLL AND NOT THROUGH ScrollTop. ***
' Assigning fraBody.ScrollTop makes MSForms invalidate and repaint the ENTIRE frame.
' That frame holds the full-width chart Images, and those Images hold EMF metafiles,
' so every notch replayed the whole vector drawing - which is why the wheel lagged
' while DRAGGING THE SCROLLBAR over the same distance stayed smooth. The scrollbar
' does not go through ScrollTop: it scrolls the frame's own window, and MSForms then
' bitblts the pixels already on screen and repaints only the newly exposed strip.
'
' Sending the frame's window the same WM_VSCROLL the scrollbar sends puts the wheel
' on that identical path. It also means the scroll no longer costs a VBA property
' assignment at all - the message goes straight to MSForms' window procedure.
'
' mUseVScroll is CALIBRATED AT RUNTIME rather than assumed: MSForms containers are
' not documented as windowed, and if this Office build's Frame turns out to have no
' window of its own (or ignores WM_VSCROLL), the first attempt moves nothing, the
' flag latches False, and every later notch uses the ScrollTop assignment that was
' here before. Slow beats broken, and neither one can hang.
Private mUseVScroll As Boolean      ' True until proven otherwise - see ScrollFrame
Private mVScrollTested As Boolean
Private mWheelX As Long             ' screen coords of the notch being applied,
Private mWheelY As Long             ' from the WM_MOUSEWHEEL that queued it

'================================== hook =======================================
' caption - the form's Caption, used to find its window.
' A modeless UserForm is a ThunderDFrame; a modal one is a ThunderXFrame. Try both
' so this keeps working if the form is ever shown modal.
'
' Idempotent on purpose: calling it twice must not chain a second subclass onto the
' first. UserForm_Activate fires again every time the form regains focus, so this
' WILL be called repeatedly.
Public Sub HookWheel(ByVal caption As String)
    On Error Resume Next
    If Not WHEEL_ENABLED Then Exit Sub          ' kill switch: no subclass at all

    If mHwnd <> 0 Then
        ' Already hooked - never chain. Unless the handle is stale: a previous form
        ' whose window died without UnhookWheel (a Stop/Reset in the VBE) would
        ' otherwise leave this module convinced it is hooked for the rest of the
        ' session, and the wheel would silently do nothing in every later form.
        If IsWindow(mHwnd) <> 0 Then Exit Sub
        TrcAlert "HookWheel: the previously hooked window is gone - discarding the " & _
                 "stale handle. Something closed the form without UnhookWheel."
        mHwnd = 0
        mPrevProc = 0
        mInProc = False
    End If

    Dim H As LongPtr
    H = FindWindowA("ThunderDFrame", caption)
    If H = 0 Then H = FindWindowA("ThunderXFrame", caption)
    If H = 0 Then
        TrcAlert "HookWheel: no UserForm window titled """ & caption & """ - " & _
                 "wheel scrolling is off (the form still works, the scrollbar still does)."
        Exit Sub
    End If

    Dim prev As LongPtr
#If Win64 Then
    prev = SetWindowLongPtrA(H, GWL_WNDPROC, AddressOf WheelProc)
#Else
    prev = SetWindowLongA(H, GWL_WNDPROC, AddressOf WheelProc)
#End If
    If prev = 0 Then
        TrcAlert "HookWheel: the window procedure could not be replaced - wheel scrolling is off."
        Exit Sub
    End If

    mPrevProc = prev
    mHwnd = H
    mEnabled = True
    Trc "HookWheel", "hwnd=" & CStr(H) & " prev=" & CStr(prev)
End Sub

' Restores the original window procedure. Safe to call when not hooked, and safe to
' call twice - both happen (QueryClose then Terminate).
Public Sub UnhookWheel()
    On Error Resume Next
    If mHwnd = 0 Then GoTo Done

    ' If the window is already gone there is nothing to restore, and poking a dead
    ' handle would be worse than doing nothing.
    If IsWindow(mHwnd) <> 0 And mPrevProc <> 0 Then
#If Win64 Then
        SetWindowLongPtrA mHwnd, GWL_WNDPROC, mPrevProc
#Else
        SetWindowLongA mHwnd, GWL_WNDPROC, mPrevProc
#End If
        Trc "UnhookWheel", "restored hwnd=" & CStr(mHwnd)
    Else
        TrcAlert "UnhookWheel: the form window was already destroyed - nothing to restore."
    End If

Done:
    mHwnd = 0
    mPrevProc = 0
    mInProc = False             ' a freeze must not survive into the next form
    mPending = 0
    Set mPage = Nothing
    Set mList = Nothing
    mEnabled = False
    On Error GoTo 0
End Sub

Public Function WheelHooked() As Boolean
    WheelHooked = (mHwnd <> 0)
End Function

'================================= targets =====================================
' The scrollable body frame - the target whenever no dropdown is open.
Public Sub SetWheelPage(ByVal fr As Object)
    Set mPage = fr
End Sub

' A multi-select filter dropped its list: its items become the wheel target until
' PopWheelList. The popup's scrim covers the whole form while it is open, so there
' is nothing else the wheel could sensibly mean.
Public Sub PushWheelList(ByVal lb As Object)
    Set mList = lb
End Sub

Public Sub PopWheelList()
    Set mList = Nothing
End Sub

' The form turns this off around a render. The old hook's worst failure was firing
' inside ShowPreview's DoEvents and leaving the dashboard blank; an inert wheel
' cannot do that.
Public Property Let Enabled(ByVal b As Boolean)
    mEnabled = b
End Property

Public Property Get Enabled() As Boolean
    Enabled = mEnabled And (mHwnd <> 0)
End Property

'============================ the window procedure =============================
' Everything in here runs on Excel's UI thread in the middle of message dispatch.
' It must not raise, must not pump messages (no DoEvents, no MsgBox), and must pass
' on every message it does not consume.
Private Function WheelProc(ByVal hwnd As LongPtr, ByVal msg As Long, ByVal wParam As LongPtr, ByVal lParam As LongPtr) As LongPtr
    On Error Resume Next

    If msg = WM_MOUSEWHEEL And mEnabled Then
        If HasTarget() Then
            ' Accept the notch either way - see mPending. A re-entrant call adds to
            ' the total and returns; the call already in flight applies it.
            ' lParam carries the cursor in SCREEN coords, which is what locates the
            ' frame's window; keep the latest, so a burst scrolls whatever the
            ' pointer is over now.
            mWheelX = LoWordSigned(lParam)
            mWheelY = HiWordSigned(lParam)
            mPending = mPending + WheelDelta(wParam)
            If Not mInProc Then DrainWheel
            WheelProc = 0                       ' consumed
            Exit Function
        End If
    End If

    If mPrevProc <> 0 Then
        WheelProc = CallWindowProcA(mPrevProc, hwnd, msg, wParam, lParam)
    Else
        WheelProc = DefWindowProcA(hwnd, msg, wParam, lParam)
    End If
End Function

Private Function HasTarget() As Boolean
    HasTarget = Not (mList Is Nothing) Or Not (mPage Is Nothing)
End Function

' Applies everything accumulated in mPending, including whatever arrives WHILE it is
' applying - MSForms pumps messages during the repaint, so more notches land in
' mPending mid-loop and are picked up on the next turn rather than recursing.
'
' The iteration cap is not expected to bind: each turn either moves the target or
' stops the loop. It is here so that no conceivable message storm can leave VBA
' spinning inside a window procedure, which is the one place a runaway loop cannot
' be interrupted from the keyboard.
Private Sub DrainWheel()
    On Error Resume Next
    Dim d As Long, turns As Long
    mInProc = True
    Do While mPending <> 0
        d = mPending
        mPending = 0
        If Not ScrollBy(d) Then Exit Do         ' hit the end of the target - stop
        turns = turns + 1
        If turns > 100 Then Exit Do
    Loop
    mPending = 0
    mInProc = False
End Sub

' The signed HIWORD of wParam. Doing this with integer division rather than a cast
' keeps it correct on both pointer widths.
Private Function WheelDelta(ByVal wParam As LongPtr) As Long
    Dim hi As Long
    hi = CLng((wParam \ &H10000) And &HFFFF&)
    If hi >= &H8000& Then hi = hi - &H10000
    WheelDelta = hi
End Function

' True = handled. A dropped list wins over the page; if neither can move, the
' message goes on to the original procedure untouched.
Private Function ScrollBy(ByVal delta As Long) As Boolean
    If delta = 0 Then Exit Function
    Dim notches As Double
    notches = delta / WHEEL_NOTCH               ' positive = wheel away = scroll up

    If Not mList Is Nothing Then
        ScrollBy = ScrollList(notches)
    ElseIf Not mPage Is Nothing Then
        ScrollBy = ScrollFrame(notches)
    End If
End Function

' ListBox: move the first visible row. TopIndex clamps itself at the top but not at
' the bottom, so clamp there by hand or the list jumps to a blank tail.
Private Function ScrollList(ByVal notches As Double) As Boolean
    On Error Resume Next
    Dim n As Long, top As Long, want As Long
    n = mList.ListCount
    If n = 0 Then Exit Function

    top = mList.TopIndex
    want = top - CLng(notches * LIST_STEP_ROWS)
    If want < 0 Then want = 0
    If want > n - 1 Then want = n - 1
    If want = top Then Exit Function            ' already at that end - let it pass

    mList.TopIndex = want
    ScrollList = True
End Function

' Native path first, ScrollTop as the fallback. See mUseVScroll for why both exist
' and why the choice is measured rather than assumed.
Private Function ScrollFrame(ByVal notches As Double) As Boolean
    If mUseVScroll Or Not mVScrollTested Then
        If ScrollFrameNative(notches) Then
            mUseVScroll = True
            mVScrollTested = True
            ScrollFrame = True
            Exit Function
        End If
        If Not mVScrollTested Then
            mVScrollTested = True
            mUseVScroll = False
            TrcAlert "Wheel: this build's Frame does not scroll on WM_VSCROLL - " & _
                     "falling back to ScrollTop for the rest of the session " & _
                     "(it works, it just repaints the whole frame per notch)."
        End If
    End If
    ScrollFrame = ScrollFrameAssign(notches)
End Function

' Scrolls the frame the way its own scrollbar does: WM_VSCROLL to the frame's window.
' MSForms then bitblts and repaints only the exposed strip, instead of replaying
' every chart metafile in the frame.
'
' The window is found from the cursor rather than cached, so the notch acts on
' whatever is under the pointer - and a handle is only accepted if it is a CHILD of
' our form. WindowFromPoint returns the topmost window at that point on the whole
' desktop; without that check a notch over another application, or over Excel's grid
' behind a modeless form, would have us posting scroll messages into someone else's
' window.
Private Function ScrollFrameNative(ByVal notches As Double) As Boolean
    On Error Resume Next
    If mHwnd = 0 Then Exit Function

    Dim H As LongPtr
#If Win64 Then
    Dim pt As LongLong
    pt = ((CLngLng(mWheelY) And &HFFFFFFFF^) * &H100000000^) Or (CLngLng(mWheelX) And &HFFFFFFFF^)
    H = WindowFromPoint(pt)
#Else
    H = WindowFromPoint(mWheelX, mWheelY)
#End If
    If H = 0 Then Exit Function
    If H = mHwnd Then Exit Function             ' the form itself - frame is windowless
    If IsChild(mHwnd, H) = 0 Then Exit Function ' not ours - never scroll it

    ' Did it actually move? That is the whole calibration: MSForms containers are not
    ' documented as windowed, so the answer decides the path for the session.
    Dim before As Single, lines As Long, i As Long, cmd As Long
    before = mPage.ScrollTop

    lines = Abs(CLng(notches * FRAME_STEP_LINES))
    If lines = 0 Then lines = 1
    If lines > 30 Then lines = 30               ' a burst is still one gesture
    cmd = IIf(notches > 0, SB_LINEUP, SB_LINEDOWN)

    For i = 1 To lines
        SendMessageA H, WM_VSCROLL, cmd, 0
    Next i
    SendMessageA H, WM_VSCROLL, SB_ENDSCROLL, 0

    ScrollFrameNative = (mPage.ScrollTop <> before)
End Function

' The original path. ScrollTop is in points and does NOT clamp - assigning past the
' end leaves the frame scrolled into empty space with no way back.
Private Function ScrollFrameAssign(ByVal notches As Double) As Boolean
    On Error Resume Next
    Dim maxTop As Single, want As Single, cur As Single
    maxTop = mPage.ScrollHeight - mPage.InsideHeight
    If maxTop <= 0 Then Exit Function           ' nothing to scroll - let it pass

    cur = mPage.ScrollTop
    want = cur - CSng(notches * FRAME_STEP_PT)
    If want < 0 Then want = 0
    If want > maxTop Then want = maxTop
    If want = cur Then Exit Function

    mPage.ScrollTop = want
    ScrollFrameAssign = True
End Function

' Signed low / high word of lParam (the cursor, in screen coords). Integer division
' rather than a cast keeps both correct on either pointer width, and screen
' coordinates really can be negative on a multi-monitor desktop.
Private Function LoWordSigned(ByVal lParam As LongPtr) As Long
    Dim v As Long
    v = CLng(lParam And &HFFFF&)
    If v >= &H8000& Then v = v - &H10000
    LoWordSigned = v
End Function

Private Function HiWordSigned(ByVal lParam As LongPtr) As Long
    Dim v As Long
    v = CLng((lParam \ &H10000) And &HFFFF&)
    If v >= &H8000& Then v = v - &H10000
    HiWordSigned = v
End Function
