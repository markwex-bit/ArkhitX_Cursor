Attribute VB_Name = "modTpcWin32"
'==================================================================================
' modTpcWin32  -  Window-level diagnostics for the "Excel spins, won't open or
' close a file, but macros still run" symptom. Read by modTpcDiagnostics.
'
' WHY THIS EXISTS
' TpcState showed Application.ScreenUpdating = False, and TpcReset showed that
' setting it back to True DOES NOT TAKE - the next line reads False again.
' EnableEvents / Interactive / Cursor / StatusBar all set fine. Only the properties
' that touch the UI and the calc engine refuse (ScreenUpdating, DisplayAlerts,
' Calculation). Excel behaves like that in exactly two situations, and neither is
' visible from any VBA property:
'
'   1. Excel's main window is DISABLED, because a modal window exists that VBA
'      cannot see - a dialog whose owner was never re-enabled, a UserForm window
'      destroyed without its modal state being unwound. A disabled main window
'      cannot accept the file-open / file-close commands, and Windows paints the
'      busy pointer over it. VBA.UserForms.Count still reports 0.
'
'   2. Window painting is locked: someone called LockWindowUpdate(hwnd) and never
'      called LockWindowUpdate(0). Excel implements ScreenUpdating on top of that
'      lock, which is precisely why assigning True has no effect.
'
' UiDiag reports which. UiUnstick clears both.
'
' NB: keep each Declare on ONE physical line - a continuation in the declarations
' section makes the refresher's AddFromString inject a phantom "()" procedure.
'==================================================================================
Option Explicit

Private Const GW_OWNER As Long = 4

Private Declare PtrSafe Function IsWindowEnabled Lib "user32" (ByVal hwnd As LongPtr) As Long
Private Declare PtrSafe Function IsWindowVisible Lib "user32" (ByVal hwnd As LongPtr) As Long
Private Declare PtrSafe Function EnableWindow Lib "user32" (ByVal hwnd As LongPtr, ByVal fEnable As Long) As Long
Private Declare PtrSafe Function LockWindowUpdate Lib "user32" (ByVal hwndLock As LongPtr) As Long
Private Declare PtrSafe Function GetForegroundWindow Lib "user32" () As LongPtr
Private Declare PtrSafe Function SetForegroundWindow Lib "user32" (ByVal hwnd As LongPtr) As Long
Private Declare PtrSafe Function GetLastActivePopup Lib "user32" (ByVal hwnd As LongPtr) As LongPtr
Private Declare PtrSafe Function GetWindow Lib "user32" (ByVal hwnd As LongPtr, ByVal wCmd As Long) As LongPtr
Private Declare PtrSafe Function GetClassName Lib "user32" Alias "GetClassNameA" (ByVal hwnd As LongPtr, ByVal lpClassName As String, ByVal nMaxCount As Long) As Long
Private Declare PtrSafe Function GetWindowTextA Lib "user32" (ByVal hwnd As LongPtr, ByVal lpString As String, ByVal cch As Long) As Long
Private Declare PtrSafe Function GetWindowThreadProcessId Lib "user32" (ByVal hwnd As LongPtr, ByRef lpdwProcessId As Long) As Long
Private Declare PtrSafe Function EnumThreadWindows Lib "user32" (ByVal dwThreadId As Long, ByVal lpfn As LongPtr, ByVal lParam As LongPtr) As Long
Private Declare PtrSafe Function EnumWindows Lib "user32" (ByVal lpfn As LongPtr, ByVal lParam As LongPtr) As Long

Private mFound As String            ' accumulator for the EnumThreadWindows callback
Private mXlHwnd As LongPtr

' Excel's main window handle. Application.Hwnd exists from Excel 2013; fall back to
' the foreground window's owner chain if it doesn't.
Private Function XlHwnd() As LongPtr
    On Error Resume Next
    XlHwnd = Application.hwnd
    On Error GoTo 0
End Function

' The report. Every line here is a fact Windows gives us, not an inference.
Public Function UiDiag() As String
    Dim s As String, H As LongPtr, pop As LongPtr
    On Error Resume Next

    H = XlHwnd()
    If H = 0 Then
        UiDiag = "  Application.Hwnd unavailable - cannot inspect windows." & vbCrLf
        Exit Function
    End If

    s = s & "  Excel main window : " & WinDesc(H) & vbCrLf
    If IsWindowEnabled(H) = 0 Then
        s = s & "  *** MAIN WINDOW IS DISABLED - a modal window is holding Excel ***" & vbCrLf
    Else
        s = s & "  Main window       : enabled (good)" & vbCrLf
    End If
    s = s & "  Main window shown : " & (IsWindowVisible(H) <> 0) & vbCrLf

    pop = GetLastActivePopup(H)
    If pop <> 0 And pop <> H Then
        s = s & "  *** ACTIVE POPUP OWNED BY EXCEL: " & WinDesc(pop) & " ***" & vbCrLf
    Else
        s = s & "  Active popup      : none (good)" & vbCrLf
    End If

    s = s & "  Foreground window : " & WinDesc(GetForegroundWindow()) & vbCrLf

    ' Every visible top-level window on Excel's UI thread. A stray dialog or an
    ' orphaned UserForm window (class ThunderDFrame) shows up here even when
    ' VBA.UserForms.Count says 0.
    s = s & "  Visible windows on Excel's UI thread:" & vbCrLf
    mFound = ""
    mXlHwnd = H
    Dim tid As Long, pid As Long
    tid = GetWindowThreadProcessId(H, pid)
    EnumThreadWindows tid, AddressOf EnumThreadProc, 0
    If Len(mFound) = 0 Then mFound = "      (none besides the main window)" & vbCrLf
    s = s & mFound

    On Error GoTo 0
    UiDiag = s
End Function

' Clears both stuck states, then reports what changed. Safe to run any time:
' LockWindowUpdate(0) with no lock held is a no-op, and enabling an already-enabled
' window does nothing.
Public Function UiUnstick() As String
    Dim s As String, H As LongPtr, wasDisabled As Boolean
    On Error Resume Next

    ' 1. release any leaked painting lock - this is the one that makes
    '    Application.ScreenUpdating = True silently fail to take effect
    LockWindowUpdate 0
    s = s & "  LockWindowUpdate(0) called (releases any leaked paint lock)" & vbCrLf

    ' 2. re-enable Excel's main window if a vanished modal left it disabled
    H = XlHwnd()
    If H <> 0 Then
        wasDisabled = (IsWindowEnabled(H) = 0)
        If wasDisabled Then
            EnableWindow H, 1
            SetForegroundWindow H
            s = s & "  *** Excel's main window WAS DISABLED - re-enabled it ***" & vbCrLf
        Else
            s = s & "  Excel's main window was already enabled" & vbCrLf
        End If
    End If

    ' 3. only now can ScreenUpdating actually take
    Application.ScreenUpdating = True
    Application.DisplayAlerts = True
    Application.EnableEvents = True
    s = s & "  ScreenUpdating now reads : " & Application.ScreenUpdating & vbCrLf
    s = s & "  DisplayAlerts  now reads : " & Application.DisplayAlerts & vbCrLf

    On Error GoTo 0
    UiUnstick = s
End Function

' Every Excel MAIN window on the machine, with its process id. More than one PID
' here means more than one EXCEL.EXE is running - and VBA's Application object only
' ever refers to the instance hosting this workbook. A file opened into a DIFFERENT
' instance would then be completely outside everything TpcState reports, which
' would make every reading so far a measurement of the wrong process.
Public Function ExcelInstances() As String
    On Error Resume Next
    mFound = ""
    EnumWindows AddressOf EnumTopProc, 0
    On Error GoTo 0
    If Len(mFound) = 0 Then mFound = "      (none found - unexpected)" & vbCrLf
    ExcelInstances = mFound
End Function

'--------------------------------- helpers --------------------------------------
' Collects top-level XLMAIN windows (Excel main windows) across all processes.
Private Function EnumTopProc(ByVal hwnd As LongPtr, ByVal lParam As LongPtr) As Long
    Dim cls As String, n As Long
    On Error Resume Next
    cls = String$(256, vbNullChar)
    n = GetClassName(hwnd, cls, 255)
    If StrComp(Left$(cls, n), "XLMAIN", vbTextCompare) = 0 Then
        mFound = mFound & "      " & WinDesc(hwnd) & _
                 "  visible=" & (IsWindowVisible(hwnd) <> 0) & _
                 IIf(IsWindowEnabled(hwnd) = 0, "  [DISABLED]", "") & vbCrLf
    End If
    EnumTopProc = 1
End Function

Private Function EnumThreadProc(ByVal hwnd As LongPtr, ByVal lParam As LongPtr) As Long
    On Error Resume Next
    If hwnd <> mXlHwnd Then
        If IsWindowVisible(hwnd) <> 0 Then
            mFound = mFound & "      " & WinDesc(hwnd) & _
                     IIf(IsWindowEnabled(hwnd) = 0, "  [DISABLED]", "") & vbCrLf
        End If
    End If
    EnumThreadProc = 1                          ' 1 = keep enumerating
End Function

Private Function WinDesc(ByVal hwnd As LongPtr) As String
    Dim cls As String, txt As String, pid As Long, n As Long
    If hwnd = 0 Then WinDesc = "none (0)": Exit Function
    On Error Resume Next
    cls = String$(256, vbNullChar)
    n = GetClassName(hwnd, cls, 255)
    cls = Left$(cls, n)
    txt = String$(256, vbNullChar)
    n = GetWindowTextA(hwnd, txt, 255)
    txt = Left$(txt, n)
    GetWindowThreadProcessId hwnd, pid
    On Error GoTo 0
    WinDesc = "hwnd=" & CStr(hwnd) & " class=" & cls & " pid=" & pid & _
              IIf(Len(txt) > 0, " text=""" & txt & """", "")
End Function
