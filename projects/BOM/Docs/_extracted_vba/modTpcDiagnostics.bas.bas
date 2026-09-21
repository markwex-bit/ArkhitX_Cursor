Attribute VB_Name = "modTpcDiagnostics"
'==================================================================================
' modTpcDiagnostics  -  Two macros for the "Excel spins, won't close a workbook and
' won't open a new one" symptom. Both appear in Alt+F8 (no arguments, public).
'
'   TpcState   - reports what Excel's global state actually IS right now.
'   TpcReset   - puts every one of those back to normal and unloads leftover forms.
'
' WHY: that symptom is Excel refusing incoming DDE / COM calls because it considers
' itself BUSY. Opening a file from Explorer or a browser is such a call, which is
' why the file simply never opens. Excel reports busy when a macro is still on the
' stack, when a UserForm is still loaded, when it sits in a modal state, or when
' Application flags were left switched off by code that errored out before its
' cleanup ran. TpcState says which of those it is instead of us guessing.
'
' Run TpcState the moment the spinner appears - BEFORE closing anything - and send
' the text back. Then run TpcReset and see whether Excel behaves again.
'
' No API declares here on purpose: RefreshModulesFromFolder can then keep this
' module up to date in place, like the rest of the project.
'==================================================================================
Option Explicit

' Snapshot of everything that can make Excel look hung. Shows a message box and
' also writes to the Immediate window (Ctrl+G) so it can be copied out.
Public Sub TpcState()
    Dim s As String
    s = "TPC diagnostics - " & format$(Now, "yyyy-mm-dd hh:nn:ss") & vbCrLf & vbCrLf
    s = s & "--- Application flags (all should be the FIRST value) ---" & vbCrLf
    s = s & Line2("ScreenUpdating  (True)", FlagText("ScreenUpdating"))
    s = s & Line2("EnableEvents    (True)", FlagText("EnableEvents"))
    s = s & Line2("DisplayAlerts   (True)", FlagText("DisplayAlerts"))
    s = s & Line2("Interactive     (True)", FlagText("Interactive"))
    s = s & Line2("Ready           (True)", FlagText("Ready"))
    s = s & Line2("Cursor          (-4143 xlDefault)", FlagText("Cursor"))
    s = s & Line2("CutCopyMode     (0/False)", FlagText("CutCopyMode"))
    s = s & Line2("Calculation     (-4105 xlAutomatic)", FlagText("Calculation"))
    s = s & Line2("StatusBar       (False)", FlagText("StatusBar"))

    s = s & vbCrLf & "--- WINDOWS (why ScreenUpdating = True refuses to take) ---" & vbCrLf
    s = s & UiDiag()

    s = s & vbCrLf & "--- Windows CLIPBOARD (the machine-wide exclusive lock) ---" & vbCrLf
    s = s & ClipboardDiag()

    s = s & vbCrLf & "--- Loaded UserForms (should be NONE once the form is closed) ---" & vbCrLf
    s = s & LoadedForms()

    s = s & vbCrLf & "--- EXCEL PROCESSES (more than one PID = wrong instance measured) ---" & vbCrLf
    s = s & ExcelInstances()

    s = s & vbCrLf & "--- Workbook WINDOWS of THIS instance ---" & vbCrLf
    s = s & ExcelWindows()

    s = s & vbCrLf & "--- Workbooks ---" & vbCrLf
    s = s & OpenWorkbooks()

    s = s & vbCrLf & "--- Scratch sheet (2 = VeryHidden, correct; -1 = Visible, wrong) ---" & vbCrLf
    s = s & ScratchState()

    ' A MsgBox truncates - and it truncated exactly the window list that mattered.
    ' Write the whole thing to a file and open it, so nothing can be lost again.
    Debug.Print s
    Dim path As String
    path = SaveReport(s)
    If Len(path) > 0 Then
        On Error Resume Next
        Shell "notepad.exe """ & path & """", vbNormalFocus
        On Error GoTo 0
        MsgBox "Full report written to (and opened in Notepad):" & vbCrLf & vbCrLf & _
               path & vbCrLf & vbCrLf & _
               "It is also in the VBE Immediate window (Ctrl+G).", _
               vbInformation, "TPC diagnostics"
    Else
        MsgBox s, vbInformation, "TPC diagnostics"
    End If
End Sub

' Writes the report next to the user's TEMP folder; "" when it couldn't.
Private Function SaveReport(ByVal text As String) As String
    Dim p As String, fn As Integer
    On Error GoTo Nope
    p = Environ$("TEMP")
    If Len(p) = 0 Then p = Environ$("USERPROFILE")
    If Len(p) = 0 Then Exit Function
    p = p & "\TpcState_" & format$(Now, "yyyymmdd_hhnnss") & ".txt"
    fn = FreeFile
    Open p For Output As #fn
    Print #fn, text
    Close #fn
    SaveReport = p
    Exit Function
Nope:
End Function

' The workbook windows of THIS Excel instance. Excel reports ScreenUpdating oddly
' when it has no usable workbook window, so this says whether it has one.
Private Function ExcelWindows() As String
    Dim W As Window, s As String
    On Error Resume Next
    s = "  Application.Windows.Count = " & Application.Windows.Count & vbCrLf
    If Application.ActiveWindow Is Nothing Then
        s = s & "  *** ActiveWindow is Nothing ***" & vbCrLf
    Else
        s = s & "  ActiveWindow = " & Application.ActiveWindow.caption & vbCrLf
    End If
    For Each W In Application.Windows
        s = s & "    " & W.caption & "   Visible=" & W.Visible & _
                "   State=" & W.WindowState & vbCrLf
    Next W
    On Error GoTo 0
    ExcelWindows = s
End Function

' Puts Excel back to a normal, responsive state. Safe to run any time.
Public Sub TpcReset()
    Dim killed As Long
    On Error Resume Next

    ' The wheel subclass BEFORE the forms: unloading frmCostbooks destroys the very
    ' window whose procedure has to be restored, and a subclass left pointing at a
    ' VBA thunk that is about to go away is a crash, not a hang. The form's own
    ' QueryClose / Terminate normally get there first - this is the rescue path for
    ' when they did not (a Stop/Reset in the VBE while the form was open).
    UnhookWheel

    ' Loaded forms first: a form still in memory is the most likely reason Excel
    ' reports itself busy to an incoming Open request.
    Do While VBA.UserForms.Count > 0
        Unload VBA.UserForms(0)
        killed = killed + 1
        If killed > 20 Then Exit Do          ' never spin here
    Loop

    ' Window level FIRST. While a leaked paint lock or a disabled main window is in
    ' force, assigning ScreenUpdating = True is silently ignored - which is exactly
    ' what the previous TpcReset run showed.
    Dim uiMsg As String
    uiMsg = UiUnstick()

    Application.ScreenUpdating = True
    Application.EnableEvents = True
    Application.DisplayAlerts = True
    Application.Interactive = True
    Application.Cursor = xlDefault
    Application.CutCopyMode = False
    Application.StatusBar = False
    Application.Calculation = xlCalculationAutomatic

    ' A leaked OpenClipboard can only be closed by the process holding it - and VBA
    ' runs inside Excel, so if Excel is the holder this is the one thing that frees it.
    Dim cbFreed As Boolean
    cbFreed = ForceCloseClipboard()

    ' THE important one: revoke any delayed-render picture promise this Excel is still
    ' publishing (Shape.CopyPicture) and clear the scratch sheet an abandoned render
    ' left behind. A promise whose source shapes are gone is what makes the next
    ' workbook close spin - see the ole32 section of modPastePicture. CleanupScratch
    ' does the release and the delete in that order.
    CleanupScratch
    Dim cbReleased As Boolean
    cbReleased = Not ClipboardOwnedByThisProcess()

    ' re-hide any other scratch sheet a failed render left on screen
    Dim ws As Worksheet
    For Each ws In ThisWorkbook.Worksheets
        If InStr(1, ws.name, "scratch", vbTextCompare) > 0 Or _
           InStr(1, ws.name, "tmp", vbTextCompare) > 0 Then
            If ws.Visible = xlSheetVisible Then ws.Visible = xlSheetVeryHidden
        End If
    Next ws
    On Error GoTo 0

    ' Re-READ rather than assume: a reset that silently fails to take is exactly how
    ' this bug hid for so long.
    MsgBox "Excel state reset." & vbCrLf & vbCrLf & _
           killed & " leftover UserForm(s) unloaded." & vbCrLf & _
           "Clipboard openable afterwards: " & cbFreed & vbCrLf & _
           "OLE render promise revoked   : " & cbReleased & _
           IIf(cbReleased, "", "   <-- STILL OURS: a workbook close may hang") & vbCrLf & vbCrLf & _
           "--- window level ---" & vbCrLf & uiMsg & vbCrLf & _
           "Values now:" & vbCrLf & _
           "  ScreenUpdating = " & FlagText("ScreenUpdating") & vbCrLf & _
           "  DisplayAlerts  = " & FlagText("DisplayAlerts") & vbCrLf & _
           "  EnableEvents   = " & FlagText("EnableEvents") & vbCrLf & vbCrLf & _
           "All three must read TRUE. Try closing / opening a workbook now.", _
           vbInformation, "TPC diagnostics"
End Sub

'--------------------------------- helpers --------------------------------------
' One Application property as text. Read DIRECTLY, not through CallByName: the
' first version used CallByName and ScreenUpdating / DisplayAlerts / CutCopyMode /
' Calculation all came back blank, which said nothing about Excel and everything
' about CallByName. A direct read gives the real value or a real error number.
Private Function FlagText(ByVal what As String) As String
    Dim v As Variant
    On Error Resume Next
    Err.Clear
    Select Case what
        Case "ScreenUpdating": v = Application.ScreenUpdating
        Case "EnableEvents":   v = Application.EnableEvents
        Case "DisplayAlerts":  v = Application.DisplayAlerts
        Case "Interactive":    v = Application.Interactive
        Case "Ready":          v = Application.Ready
        Case "Cursor":         v = Application.Cursor
        Case "CutCopyMode":    v = Application.CutCopyMode
        Case "Calculation":    v = Application.Calculation
        Case "StatusBar":      v = Application.StatusBar
    End Select
    If Err.Number <> 0 Then
        FlagText = "<error " & Err.Number & ": " & Err.Description & ">"
        Err.Clear
    ElseIf IsEmpty(v) Then
        FlagText = "<empty>"
    ElseIf VarType(v) = vbBoolean Then
        FlagText = IIf(v, "TRUE", "FALSE")           ' locale-independent
    Else
        FlagText = CStr(v)
    End If
    On Error GoTo 0
End Function

Private Function Line2(ByVal label As String, ByVal value As String) As String
    Line2 = "  " & label & String$(IIf(Len(label) < 34, 34 - Len(label), 1), " ") & _
            " = " & value & vbCrLf
End Function

Private Function LoadedForms() As String
    Dim i As Long, s As String
    On Error Resume Next
    If VBA.UserForms.Count = 0 Then
        LoadedForms = "  (none - good)" & vbCrLf
        Exit Function
    End If
    For i = 0 To VBA.UserForms.Count - 1
        s = s & "  STILL LOADED: " & VBA.UserForms(i).name & _
                "   Visible=" & VBA.UserForms(i).Visible & vbCrLf
    Next i
    On Error GoTo 0
    LoadedForms = s
End Function

Private Function OpenWorkbooks() As String
    Dim Wb As Workbook, s As String
    On Error Resume Next
    s = "  Count = " & Application.Workbooks.Count & vbCrLf
    For Each Wb In Application.Workbooks
        s = s & "    " & Wb.name & "   Saved=" & Wb.Saved & vbCrLf
    Next Wb
    On Error GoTo 0
    OpenWorkbooks = s
End Function

Private Function ScratchState() As String
    Dim ws As Worksheet, s As String
    On Error Resume Next
    For Each ws In ThisWorkbook.Worksheets
        If InStr(1, ws.name, "scratch", vbTextCompare) > 0 Or _
           InStr(1, ws.name, "tmp", vbTextCompare) > 0 Then
            s = s & "  " & ws.name & "   Visible=" & ws.Visible & _
                    "   Shapes=" & ws.Shapes.Count & vbCrLf
        End If
    Next ws
    On Error GoTo 0
    If Len(s) = 0 Then s = "  (no scratch sheet found)" & vbCrLf
    ScratchState = s
End Function

