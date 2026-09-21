Attribute VB_Name = "clsMultiFilter"
Attribute VB_Base = "0{FCFB3D2A-A0FA-1068-A738-08002B3371B5}"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Attribute VB_TemplateDerived = False
Attribute VB_Customizable = False
'==================================================================================
' clsMultiFilter  -  Power BI style multi-select filter, built 100% in code.
'
' MSForms ComboBoxes CANNOT multi-select (MultiSelect exists only on ListBox), so
' this fakes one: a combo-LOOKING closed box (a bordered white Label + a caret)
' that, when clicked, drops a floating popup holding a search box, a checkbox
' ListBox (ListStyle = fmListStyleOption + fmMultiSelectMulti) and
' Select all / Clear / Apply.
'
' Two containers matter:
'   host     - where the closed box lives (frmCostbooks: the SCROLLING body frame)
'   popHost  - where the popup lives      (frmCostbooks: the UserForm itself)
' They must differ whenever the host scrolls or clips: a popup parented to a Frame
' would be clipped by it. OpenPopup translates the box's host coordinates into
' popHost coordinates (allowing for the host's scroll offset) before placing.
'
' Closing (MSForms has no click-outside event, so three paths cover it):
'   - a full-form TRANSPARENT Label ("scrim") shown just underneath the popup,
'     which hit-tests and closes on MouseDown (MouseDown, not Click: it fires on
'     the press, so a drag that ends elsewhere still dismisses);
'   - the popup Frame's Exit event, for the rare click that reaches a focusable
'     control instead of the scrim;
'   - Escape / the popup's own X button.
' Clicking outside or pressing Apply KEEPS what was ticked (Power BI does the
' same); Escape and X CANCEL - the selection is restored to what it was when the
' popup opened, so the popup can be opened just to read the current filter and
' dismissed with no side effect.
'
' Selection semantics match Power BI: NOTHING checked = no filter = "(All)".
' Value returns the checked values joined with FILTER_SEP, which is exactly what
' modCostbookData.FilterOk consumes (see there), so the whole filtering /
' cascading layer needs no other change.
'
' Refresh policy: checking boxes only repaints the closed box's caption. The owner
' is notified ONCE, on close, via  owner.MultiFilterChanged(Me)  - so a five-click
' selection re-renders the charts once, not five times.
'
' Usage (owner form):
'   Set mf = New clsMultiFilter
'   mf.Init Me, fraBody, Me, "mfRegion", "Region", x, y, w, "p12"
'   mf.SetItems DistinctAttr(...)        ' a leading "(All)" entry is ignored
'   s = mf.Value                         ' "(All)" or "EMEA" or "EMEA" & vbLf & "NA"
'==================================================================================
Option Explicit

'---------------------------------- palette ------------------------------------
Private Const NAVY As Long = 6893343        ' RGB(31, 47, 105)
Private Const GRAYTXT As Long = 9868950     ' RGB(150,150,150)
Private Const BOX_LINE As Long = 14602440   ' RGB(200,208,222)

'--------------------------------- geometry ------------------------------------
Private Const BOX_H As Single = 18          ' closed box height (matches the old combos)
Private Const ROW_H As Single = 12.6        ' one checkbox row at 8.5pt Segoe UI
Private Const MAX_ROWS As Long = 9          ' popup list height cap (it scrolls beyond)
Private Const pad As Single = 5
Private Const SEARCH_H As Single = 16
Private Const BTN_H As Single = 17
Private Const MIN_POP_W As Single = 165
Private Const CLOSE_W As Single = 14         ' the popup's X button

'------------------------------ event controls ---------------------------------
' NOTE: the VBE writes an "Attribute mBox.VB_VarHelpID = -1" line under every
' WithEvents declaration when it EXPORTS a class. Those lines must not survive
' here: modUpdateModules refreshes an already-existing component through
' CodeModule.AddFromString, which cannot swallow mid-file Attribute statements and
' pastes them in as literal (red) code. ReplaceCode now strips them defensively,
' but keep them out of this file anyway.
Private WithEvents mBox As MSForms.label            ' the closed "combo"
Attribute mBox.VB_VarHelpID = -1
Private WithEvents mCaret As MSForms.label          ' the down arrow inside it
Attribute mCaret.VB_VarHelpID = -1
Private WithEvents mScrim As MSForms.label          ' full-form click catcher
Attribute mScrim.VB_VarHelpID = -1
Private WithEvents mSearch As MSForms.TextBox
Attribute mSearch.VB_VarHelpID = -1
Private WithEvents mList As MSForms.ListBox
Attribute mList.VB_VarHelpID = -1
Private WithEvents mBtnAll As MSForms.CommandButton
Attribute mBtnAll.VB_VarHelpID = -1
Private WithEvents mBtnNone As MSForms.CommandButton
Attribute mBtnNone.VB_VarHelpID = -1
Private WithEvents mBtnOk As MSForms.CommandButton
Attribute mBtnOk.VB_VarHelpID = -1
Private WithEvents mBtnX As MSForms.label           ' popup's own close (cancel) button
Attribute mBtnX.VB_VarHelpID = -1
Private WithEvents mPop As MSForms.Frame            ' the popup itself (Exit = focus left it)
Attribute mPop.VB_VarHelpID = -1

'------------------------------ passive controls -------------------------------
Private mCap As MSForms.label                       ' small caption above the box

'---------------------------------- state --------------------------------------
Private mOwner As Object            ' the form (must expose MultiFilterChanged / PopupOpened / PopupClosed)
Private mHost As Object             ' container of the closed box
Private mPopHost As Object          ' container of the popup
Private mName As String
Private mTag As String              ' owner-defined group tag ("p12" / "ex")
Private mItems() As String          ' available values, 0-based, WITHOUT "(All)"
Private mCount As Long
Private mSel As Object              ' Scripting.Dictionary of checked values (text compare)
Private mSnap As Object             ' mSel as it was when the popup opened (Escape / X restore it)
Private mShown() As Long            ' mItems indexes currently listed (search filter)
Private mShownN As Long
Private mBuilding As Boolean        ' guard: True while the ListBox is repopulated in code
Private mOpen As Boolean
Private mDirty As Boolean           ' selection changed since the popup opened
Private mDetached As Boolean        ' Detach has run: the control fields are Nothing
Private mBoxL As Single, mBoxT As Single, mBoxW As Single

'================================== build ======================================
' owner   - form receiving the callbacks
' host    - container of the closed box (may scroll)
' popHost - container of the popup (must NOT clip: the UserForm)
' nm      - unique control-name stem
' caption - the small label above the box ("" = no caption label)
' tg      - free string the owner reads back in MultiFilterChanged (the Tag property)
Public Sub Init(ByVal owner As Object, ByVal host As Object, ByVal popHost As Object, _
        ByVal nm As String, ByVal caption As String, ByVal L As Single, ByVal T As Single, _
        ByVal W As Single, ByVal tg As String)
    Set mOwner = owner
    Set mHost = host
    Set mPopHost = popHost
    mName = nm
    mTag = tg
    mBoxL = L: mBoxT = T: mBoxW = W
    Set mSel = CreateObject("Scripting.Dictionary")
    mSel.CompareMode = vbTextCompare
    mCount = 0
    mShownN = 0

    If Len(caption) > 0 Then
        Set mCap = host.Controls.Add("Forms.Label.1", nm & "Cap", True)
        Place mCap, L, T - 11, W, 10
        mCap.caption = caption & ":"
        mCap.BackStyle = fmBackStyleTransparent
        mCap.font.name = "Segoe UI"
        mCap.font.Size = 7.5
        mCap.ForeColor = NAVY
    End If

    ' the closed box: a Label dressed as a drop-down-list ComboBox
    Set mBox = host.Controls.Add("Forms.Label.1", nm & "Box", True)
    Place mBox, L, T, W, BOX_H
    mBox.BackStyle = fmBackStyleOpaque
    mBox.BackColor = vbWhite
    mBox.BorderStyle = fmBorderStyleSingle
    mBox.BorderColor = BOX_LINE
    mBox.font.name = "Segoe UI"
    mBox.font.Size = 8.5
    mBox.TextAlign = fmTextAlignLeft
    mBox.WordWrap = False
    mBox.caption = " " & FILTER_ALL

    Set mCaret = host.Controls.Add("Forms.Label.1", nm & "Caret", True)
    Place mCaret, L + W - 14, T + 1, 12, BOX_H - 2
    mCaret.BackStyle = fmBackStyleTransparent
    mCaret.caption = ChrW(9660)                  ' black down-pointing triangle
    mCaret.font.name = "Segoe UI"
    mCaret.font.Size = 6
    mCaret.ForeColor = NAVY
    mCaret.TextAlign = fmTextAlignCenter

    BuildPopup
End Sub

Private Sub BuildPopup()
    Dim popW As Single
    popW = mBoxW
    If popW < MIN_POP_W Then popW = MIN_POP_W

    ' the scrim sits BELOW the popup in z-order and swallows outside clicks
    Set mScrim = mPopHost.Controls.Add("Forms.Label.1", mName & "Scrim", True)
    Place mScrim, 0, 0, 10, 10
    mScrim.BackStyle = fmBackStyleTransparent    ' invisible, but still hit-tested
    mScrim.caption = ""
    mScrim.Visible = False

    Set mPop = mPopHost.Controls.Add("Forms.Frame.1", mName & "Pop", True)
    Place mPop, 0, 0, popW, 100
    mPop.caption = ""
    mPop.BackColor = vbWhite
    mPop.BorderStyle = fmBorderStyleSingle
    mPop.BorderColor = NAVY
    mPop.SpecialEffect = fmSpecialEffectFlat
    mPop.ScrollBars = fmScrollBarsNone
    mPop.Visible = False

    Dim innerW As Single: innerW = popW - 2 * pad - 2

    ' search field + a close (X) button on its right: the popup can always be
    ' dismissed from inside it, even when the user only opened it to look
    Set mSearch = mPop.Controls.Add("Forms.TextBox.1", mName & "Search", True)
    Place mSearch, pad, pad, innerW - CLOSE_W - 3, SEARCH_H
    mSearch.font.name = "Segoe UI"
    mSearch.font.Size = 8.5
    mSearch.BorderStyle = fmBorderStyleSingle
    mSearch.BorderColor = BOX_LINE

    Set mBtnX = mPop.Controls.Add("Forms.Label.1", mName & "X", True)
    Place mBtnX, pad + innerW - CLOSE_W, pad, CLOSE_W, SEARCH_H
    mBtnX.BackStyle = fmBackStyleTransparent
    mBtnX.caption = ChrW(10005)                  ' multiplication X
    mBtnX.font.name = "Segoe UI"
    mBtnX.font.Size = 8
    mBtnX.ForeColor = GRAYTXT
    mBtnX.TextAlign = fmTextAlignCenter
    mBtnX.ControlTipText = "Close without changing the filter (Esc)"

    Set mList = mPop.Controls.Add("Forms.ListBox.1", mName & "List", True)
    Place mList, pad, pad + SEARCH_H + 3, innerW, ROW_H * 3
    mList.ListStyle = fmListStyleOption          ' real checkboxes
    mList.MultiSelect = fmMultiSelectMulti
    mList.ColumnCount = 1
    mList.font.name = "Segoe UI"
    mList.font.Size = 8.5
    mList.BorderStyle = fmBorderStyleSingle
    mList.BorderColor = BOX_LINE

    Dim bw As Single: bw = (innerW - 8) / 3
    Set mBtnAll = AddPopBtn(mName & "All", "Select all", pad, 0, bw, False)
    Set mBtnNone = AddPopBtn(mName & "None", "Clear", pad + bw + 4, 0, bw, False)
    Set mBtnOk = AddPopBtn(mName & "Ok", "Apply", pad + 2 * (bw + 4), 0, bw, True)
End Sub

Private Function AddPopBtn(ByVal nm As String, ByVal cap As String, ByVal L As Single, _
        ByVal T As Single, ByVal W As Single, ByVal primary As Boolean) As MSForms.CommandButton
    Dim c As MSForms.CommandButton
    Set c = mPop.Controls.Add("Forms.CommandButton.1", nm, True)
    Place c, L, T, W, BTN_H
    c.caption = cap
    c.font.name = "Segoe UI"
    c.font.Size = 7.5
    If primary Then
        c.BackColor = NAVY
        c.ForeColor = vbWhite
        c.font.bold = True
    End If
    Set AddPopBtn = c
End Function

Private Sub Place(ByVal c As Object, ByVal L As Single, ByVal T As Single, _
        ByVal W As Single, ByVal H As Single)
    c.Left = L: c.top = T: c.width = W: c.Height = H
End Sub

'============================== items / selection ==============================
' Swaps the available values (cascading reload). A leading "(All)" entry - as
' returned by DistinctAttr / ExplorerDistinct - is ignored: "all" is expressed by
' checking nothing. Checked values that no longer exist are dropped, exactly like
' the ComboBox reload this replaces.
Public Sub SetItems(ByVal values As Variant)
    If mDetached Then Exit Sub                  ' teardown already took the controls away
    Dim i As Long, s As String
    mCount = 0
    Erase mItems
    If IsArray(values) Then
        ReDim mItems(0 To UBound(values) - LBound(values))
        For i = LBound(values) To UBound(values)
            s = Trim$(CStr(values(i)))
            If Len(s) > 0 And StrComp(s, FILTER_ALL, vbTextCompare) <> 0 Then
                mItems(mCount) = s
                mCount = mCount + 1
            End If
        Next i
    End If

    ' prune selections that disappeared, so Value only ever names live values
    Dim ks As Variant, avail As Object
    Set avail = CreateObject("Scripting.Dictionary")
    avail.CompareMode = vbTextCompare
    For i = 0 To mCount - 1
        If Not avail.Exists(mItems(i)) Then avail.Add mItems(i), True
    Next i
    If mSel.Count > 0 Then
        ks = mSel.keys                           ' snapshot: safe to Remove while looping
        For i = LBound(ks) To UBound(ks)
            If Not avail.Exists(CStr(ks(i))) Then mSel.Remove ks(i)
        Next i
    End If

    RebuildList
    UpdateBox
End Sub

' The filter string this control contributes: "(All)" when nothing is checked,
' otherwise the checked values joined with FILTER_SEP - in mItems order, so the
' string is stable whatever order the user ticked them in (the pages use it as a
' render key to skip no-op refreshes).
Public Property Get value() As String
    If mSel.Count = 0 Then
        value = FILTER_ALL
        Exit Property
    End If
    Dim i As Long, s As String
    For i = 0 To mCount - 1
        If mSel.Exists(mItems(i)) Then
            If Len(s) > 0 Then s = s & FILTER_SEP
            s = s & mItems(i)
        End If
    Next i
    If Len(s) = 0 Then s = FILTER_ALL
    value = s
End Property

Public Property Get SelectedCount() As Long
    SelectedCount = mSel.Count
End Property

Public Property Get tag() As String
    tag = mTag
End Property

Public Property Get name() As String
    name = mName
End Property

' Unchecks everything WITHOUT notifying the owner (the caller drives its own
' refresh - see the form's "Clear filters" buttons).
Public Sub ClearAll()
    If mDetached Then Exit Sub
    mSel.RemoveAll
    RebuildList
    UpdateBox
End Sub

' Shows/hides every part of the control (the page-switch collections drive this
' late-bound, so the property must exist by name).
Public Property Let Visible(ByVal b As Boolean)
    If mDetached Then Exit Property
    On Error Resume Next
    If Not mCap Is Nothing Then mCap.Visible = b
    mBox.Visible = b
    mCaret.Visible = b
    If Not b Then ClosePopup False
    On Error GoTo 0
End Property

Public Property Get Visible() As Boolean
    If mDetached Then Exit Property             ' False - nothing left to show
    If mBox Is Nothing Then Exit Property
    Visible = mBox.Visible
End Property

' Breaks the owner <-> filter reference cycle so the form can actually terminate.
'
' *** CLEARING mOwner ALONE IS NOT ENOUGH - THAT WAS THE WORKBOOK-CLOSE HANG. ***
' Every WithEvents field below holds a live reference to a control that BELONGS to
' the form (mBox and friends were created through host.Controls.Add), and each of
' those controls references its parent form in turn. So even with mOwner cleared the
' graph still reads form -> filter -> control -> form: a COM reference CYCLE, which
' refcounting can never collect. The form object therefore survived Unload, and with
' it its ThunderDFrame window - an orphaned UserForm window on Excel's UI thread,
' which is cause #1 in modTpcWin32's header: macros keep running, but Excel's main
' window stays disabled, so the next workbook close spins for ever on a busy pointer.
'
' Releasing the controls here breaks the cycle at the only place that can break it.
' Detach is called twice on purpose (QueryClose AND Terminate); it is idempotent -
' ClosePopup exits on Not mOpen, and Set x = Nothing on an already-Nothing field is
' a no-op. mDetached makes the public accessors safe to touch afterwards.
Public Sub Detach()
    On Error Resume Next
    ClosePopup False
    mDetached = True
    mOpen = False
    Set mOwner = Nothing
    Set mHost = Nothing
    Set mPopHost = Nothing
    Set mCap = Nothing
    Set mBox = Nothing
    Set mCaret = Nothing
    Set mScrim = Nothing
    Set mSearch = Nothing
    Set mList = Nothing
    Set mBtnAll = Nothing
    Set mBtnNone = Nothing
    Set mBtnOk = Nothing
    Set mBtnX = Nothing
    Set mPop = Nothing
    Set mSnap = Nothing
    On Error GoTo 0
End Sub

'================================== popup ======================================
Private Sub OpenPopup()
    If mDetached Then Exit Sub
    If mOpen Then Exit Sub
    If mCount = 0 Then Exit Sub                  ' nothing to pick

    mSearch.text = ""
    RebuildList
    mDirty = False
    Snapshot                                     ' so Escape / X can put it back

    ' popup height follows the item count, capped at MAX_ROWS (then it scrolls)
    Dim rows As Long
    rows = mShownN
    If rows > MAX_ROWS Then rows = MAX_ROWS
    If rows < 2 Then rows = 2
    mList.Height = rows * ROW_H + 3
    mBtnAll.top = mList.top + mList.Height + 4
    mBtnNone.top = mBtnAll.top
    mBtnOk.top = mBtnAll.top
    mPop.Height = mBtnAll.top + BTN_H + pad + 2

    ' host coordinates -> popHost coordinates (the host scrolls under the popup)
    Dim absL As Single, absT As Single
    absL = mBoxL: absT = mBoxT
    If Not mHost Is mPopHost Then
        absL = absL + mHost.Left
        absT = absT + mHost.top
        On Error Resume Next                     ' a non-scrolling host has no Scroll*
        absL = absL - mHost.ScrollLeft
        absT = absT - mHost.ScrollTop
        On Error GoTo 0
    End If

    Dim popT As Single, popL As Single
    popT = absT + BOX_H
    If popT + mPop.Height > mPopHost.InsideHeight Then
        popT = absT - mPop.Height                ' no room below: flip above the box
        If popT < 0 Then popT = mPopHost.InsideHeight - mPop.Height
    End If
    If popT < 0 Then popT = 0
    popL = absL
    If popL + mPop.width > mPopHost.InsideWidth Then popL = mPopHost.InsideWidth - mPop.width
    If popL < 0 Then popL = 0
    mPop.Left = popL
    mPop.top = popT

    mScrim.Left = 0: mScrim.top = 0
    mScrim.width = mPopHost.InsideWidth
    mScrim.Height = mPopHost.InsideHeight
    mScrim.Visible = True
    mScrim.ZOrder 0                              ' 0 = bring to front
    mPop.Visible = True
    mPop.ZOrder 0                                ' ...and the popup above the scrim

    mOpen = True
    On Error Resume Next

    ' The wheel now means "scroll these items", not "scroll the page underneath".
    ' The scrim covers the whole form while the popup is up, so there is nothing
    ' else the wheel could sensibly act on. PushWheelList is paired with the
    ' PopWheelList in ClosePopup, which every exit route goes through.
    PushWheelList mList

    mOwner.PopupOpened
    mSearch.SetFocus
    On Error GoTo 0
End Sub

' notify = True raises MultiFilterChanged when the selection actually changed.
' mOpen is cleared FIRST: hiding the popup moves the focus out of it, which
' re-enters here through mPop_Exit, and the guard above absorbs that.
Private Sub ClosePopup(ByVal notify As Boolean)
    If Not mOpen Then Exit Sub
    mOpen = False
    On Error Resume Next
    PopWheelList                                 ' the wheel goes back to the body frame
    mHost.SetFocus                               ' MSForms refuses to hide a container holding the focus
    mPop.Visible = False
    mScrim.Visible = False
    mOwner.PopupClosed
    On Error GoTo 0
    UpdateBox
    If notify And mDirty Then
        mDirty = False
        If Not mOwner Is Nothing Then mOwner.MultiFilterChanged Me
    End If
    mDirty = False
End Sub

' Escape / X: drop whatever was ticked while the popup was open and close without
' notifying - "I only came to look".
Private Sub CancelPopup()
    If Not mOpen Then Exit Sub
    RestoreSnapshot
    mDirty = False
    ClosePopup False
End Sub

Private Sub Snapshot()
    Dim ks As Variant, i As Long
    Set mSnap = CreateObject("Scripting.Dictionary")
    mSnap.CompareMode = vbTextCompare
    If mSel.Count = 0 Then Exit Sub
    ks = mSel.keys
    For i = LBound(ks) To UBound(ks)
        mSnap.Add CStr(ks(i)), True
    Next i
End Sub

Private Sub RestoreSnapshot()
    If mSnap Is Nothing Then Exit Sub
    Dim ks As Variant, i As Long
    mSel.RemoveAll
    If mSnap.Count > 0 Then
        ks = mSnap.keys
        For i = LBound(ks) To UBound(ks)
            mSel.Add CStr(ks(i)), True
        Next i
    End If
    RebuildList
    UpdateBox
End Sub

'=============================== list plumbing =================================
' Refills the popup list with the values matching the search text, restoring each
' row's checkbox from mSel (so searching never loses a selection).
Private Sub RebuildList()
    Dim q As String
    On Error Resume Next
    q = Trim$(mSearch.text & "")
    On Error GoTo 0

    mBuilding = True
    mList.Clear
    mShownN = 0
    If mCount > 0 Then ReDim mShown(0 To mCount - 1)
    Dim i As Long
    For i = 0 To mCount - 1
        If Len(q) = 0 Or InStr(1, mItems(i), q, vbTextCompare) > 0 Then
            mList.AddItem mItems(i)
            mShown(mShownN) = i
            mList.Selected(mShownN) = mSel.Exists(mItems(i))
            mShownN = mShownN + 1
        End If
    Next i
    mBuilding = False
End Sub

' Mirrors the visible rows' checkboxes into mSel. Rows hidden by the search are
' left untouched - that's why mSel, not the ListBox, is the source of truth.
Private Sub SyncFromList()
    If mBuilding Then Exit Sub
    Dim i As Long, v As String
    For i = 0 To mShownN - 1
        v = mItems(mShown(i))
        If mList.Selected(i) Then
            If Not mSel.Exists(v) Then mSel.Add v, True
        Else
            If mSel.Exists(v) Then mSel.Remove v
        End If
    Next i
    mDirty = True
    UpdateBox
End Sub

' Closed-box caption, Power BI style: "(All)" / the single value / "n selected",
' with the full list on the tooltip.
Private Sub UpdateBox()
    Dim n As Long: n = mSel.Count
    Dim cap As String, tip As String
    If n = 0 Then
        cap = FILTER_ALL
        tip = "All values (no filter)"
        mBox.ForeColor = GRAYTXT
    ElseIf n = 1 Then
        cap = FirstSelected()
        tip = cap
        mBox.ForeColor = vbBlack
    Else
        cap = n & " selected"
        tip = Replace(value, FILTER_SEP, ", ")
        mBox.ForeColor = vbBlack
    End If
    mBox.caption = " " & cap
    On Error Resume Next
    mBox.ControlTipText = tip
    mCaret.ControlTipText = tip
    On Error GoTo 0
End Sub

Private Function FirstSelected() As String
    Dim i As Long
    For i = 0 To mCount - 1
        If mSel.Exists(mItems(i)) Then
            FirstSelected = mItems(i)
            Exit Function
        End If
    Next i
End Function

'================================== events =====================================
Private Sub mBox_Click()
    TogglePopup
End Sub
Private Sub mCaret_Click()
    TogglePopup
End Sub
Private Sub TogglePopup()
    If mOpen Then ClosePopup True Else OpenPopup
End Sub

' Any click outside the popup keeps the ticks and closes it (the scrim covers the
' whole form). MouseDown, not Click: Click needs press AND release on the same
' label, so a press that drifts a few pixels - or one landing on a spot the label
' does not hit-test on release - would leave the popup stranded open.
Private Sub mScrim_MouseDown(ByVal Button As Integer, ByVal Shift As Integer, _
        ByVal x As Single, ByVal y As Single)
    ClosePopup True
End Sub

Private Sub mScrim_Click()
    ClosePopup True                              ' belt and braces
End Sub

' Last-resort path: a click that somehow reaches a focusable control instead of
' the scrim takes the focus out of the popup frame, which lands here.
Private Sub mPop_Exit(ByVal Cancel As MSForms.ReturnBoolean)
    ClosePopup True
End Sub

Private Sub mBtnX_Click()
    CancelPopup
End Sub

Private Sub mBtnX_MouseMove(ByVal Button As Integer, ByVal Shift As Integer, _
        ByVal x As Single, ByVal y As Single)
    mBtnX.ForeColor = NAVY                       ' hover feedback: it IS a button
End Sub

Private Sub mPop_MouseMove(ByVal Button As Integer, ByVal Shift As Integer, _
        ByVal x As Single, ByVal y As Single)
    mBtnX.ForeColor = GRAYTXT                    ' pointer left the X
End Sub

Private Sub mList_Change()
    SyncFromList
End Sub

Private Sub mSearch_Change()
    RebuildList
End Sub

' Enter = Apply, Escape = cancel (the ticks made since opening are rolled back).
Private Sub mSearch_KeyDown(ByVal KeyCode As MSForms.ReturnInteger, ByVal Shift As Integer)
    If KeyCode = vbKeyEscape Then CancelPopup
    If KeyCode = vbKeyReturn Then ClosePopup True
End Sub

Private Sub mList_KeyDown(ByVal KeyCode As MSForms.ReturnInteger, ByVal Shift As Integer)
    If KeyCode = vbKeyEscape Then CancelPopup
    If KeyCode = vbKeyReturn Then ClosePopup True
End Sub

' "Select all" ticks what the search currently SHOWS (Power BI does the same) -
' with an empty search that is simply everything.
Private Sub mBtnAll_Click()
    Dim i As Long, v As String
    For i = 0 To mShownN - 1
        v = mItems(mShown(i))
        If Not mSel.Exists(v) Then mSel.Add v, True
    Next i
    mDirty = True
    RebuildList
    UpdateBox
End Sub

Private Sub mBtnNone_Click()
    mSel.RemoveAll
    mDirty = True
    RebuildList
    UpdateBox
End Sub

Private Sub mBtnOk_Click()
    ClosePopup True
End Sub

' Backstop only. By the time this runs the cycle must already be broken - if it were
' not, this would never be reached at all, which is exactly what the bug was.
Private Sub Class_Terminate()
    Detach
    Set mSel = Nothing
End Sub

