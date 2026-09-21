Attribute VB_Name = "modTpcTrace"
'==================================================================================
' modTpcTrace  -  Opt-in execution trace for the render / export / preview / cleanup
' / close paths, with the CLIPBOARD OWNERSHIP state stamped on every line.
'
' WHY IT EXISTS
' The "Excel responds but a workbook won't close, pointer spinning" bug is caused by
' a delayed-render clipboard promise outliving the shapes it points at (see the ole32
' section of modPastePicture). That state is invisible to every Application flag, and
' the damage is done long before the symptom appears - on some earlier render, in a
' path that may have been abandoned halfway. A trace with the clipboard owner on each
' line is the only way to see WHICH path left the promise behind.
'
' The one column that matters is OWN: it is "OURS" when a window of this Excel is the
' clipboard owner, i.e. this process is still promising to render something. A healthy
' trace shows OURS only BETWEEN a CopyPicture and the matching release, and never
' across an EndTemp / delete.
'
' HOW TO USE
'   1. Alt+F8 -> TpcTraceOn        (writes to %TEMP%\TpcTrace_<stamp>.log and the
'                                   Immediate window; survives until TpcTraceOff)
'   2. Reproduce: open the form, render, close it, then close a workbook.
'   3. Alt+F8 -> TpcTraceShow      (opens the log in Notepad)
'   4. Alt+F8 -> TpcTraceOff
'
' Tracing is OFF by default and every call short-circuits on one Boolean test, so the
' instrumentation can stay in the shipped code. It never raises: a trace that breaks
' the thing it is tracing is worse than no trace.
'
' No API Declare statements here on purpose, so RefreshModulesFromFolder can keep this
' module up to date in place like the rest of the project (see modUpdateModules).
'==================================================================================
Option Explicit

Private mOn As Boolean
Private mPath As String
Private mDepth As Long              ' indent, so nested calls read as a call tree
Private mT0 As Double               ' Timer at TpcTraceOn, for relative milliseconds

'================================== control ====================================
Public Sub TpcTraceOn()
    mOn = True
    mDepth = 0
    mT0 = Timer
    mPath = TempDir() & "\TpcTrace_" & format$(Now, "yyyymmdd_hhnnss") & ".log"
    WriteLine "==== trace started " & format$(Now, "yyyy-mm-dd hh:nn:ss") & " ===="
    WriteLine "OWN=OURS means this Excel still owns the clipboard (a delayed-render"
    WriteLine "promise is outstanding). It must never be OURS across a shape delete."
    MsgBox "Tracing ON." & vbCrLf & vbCrLf & mPath & vbCrLf & vbCrLf & _
           "Reproduce the problem, then run TpcTraceShow.", vbInformation, "TPC trace"
End Sub

Public Sub TpcTraceOff()
    If mOn Then WriteLine "==== trace stopped ===="
    mOn = False
    MsgBox "Tracing OFF." & vbCrLf & vbCrLf & IIf(Len(mPath) > 0, mPath, "(no log written)"), _
           vbInformation, "TPC trace"
End Sub

Public Sub TpcTraceShow()
    If Len(mPath) = 0 Then
        MsgBox "No trace has been recorded in this session. Run TpcTraceOn first.", _
               vbExclamation, "TPC trace"
        Exit Sub
    End If
    On Error Resume Next
    Shell "notepad.exe """ & mPath & """", vbNormalFocus
    On Error GoTo 0
End Sub

Public Function TracingOn() As Boolean
    TracingOn = mOn
End Function

'=================================== writing ===================================
' One event. Call it as a statement:  Trc "RefreshPage1", "enter"
Public Sub Trc(ByVal where As String, Optional ByVal what As String = "")
    If Not mOn Then Exit Sub
    WriteLine Stamp() & Space$(mDepth * 2) & where & IIf(Len(what) > 0, "  " & what, "")
End Sub

' Entry of a traced scope (indents everything until TrcOut).
Public Sub TrcIn(ByVal where As String, Optional ByVal what As String = "")
    If Not mOn Then Exit Sub
    Trc "> " & where, what
    mDepth = mDepth + 1
End Sub

' Exit of a traced scope. Put it in the CleanUp block, never only on the happy path -
' a scope that exits through an error handler is exactly the one that leaks.
Public Sub TrcOut(ByVal where As String, Optional ByVal what As String = "")
    If Not mOn Then Exit Sub
    mDepth = mDepth - 1
    If mDepth < 0 Then mDepth = 0
    Trc "< " & where, what
End Sub

' Flags a state that should never happen, so it is greppable in the log.
Public Sub TrcAlert(ByVal msg As String)
    If Not mOn Then Exit Sub
    WriteLine Stamp() & Space$(mDepth * 2) & "*** " & msg
End Sub

'=================================== helpers ===================================
' "[  1234ms OWN=ours SU=0 EV=0 FMT=3] " - the facts that decide this bug, on every
' line. Reads the clipboard owner through modPastePicture (which owns the API).
Private Function Stamp() As String
    Dim ms As Double, own As String, su As String, ev As String
    On Error Resume Next
    ms = (Timer - mT0) * 1000#
    If ms < 0 Then ms = 0                        ' Timer wrapped at midnight
    own = "-"
    If ClipboardOwnedByThisProcess() Then own = "OURS" Else own = "free"
    su = IIf(Application.ScreenUpdating, "1", "0")
    ev = IIf(Application.EnableEvents, "1", "0")
    On Error GoTo 0
    Stamp = "[" & Right$(Space$(7) & format$(ms, "0"), 7) & "ms " & _
            "OWN=" & own & " SU=" & su & " EV=" & ev & "] "
End Function

Private Sub WriteLine(ByVal s As String)
    Debug.Print s
    If Len(mPath) = 0 Then Exit Sub
    Dim fn As Integer
    On Error Resume Next
    fn = FreeFile
    Open mPath For Append As #fn
    Print #fn, s
    Close #fn
    On Error GoTo 0
End Sub

Private Function TempDir() As String
    Dim p As String
    p = Environ$("TEMP")
    If Len(p) = 0 Then p = Environ$("TMP")
    If Len(p) = 0 Then p = Environ$("USERPROFILE")
    TempDir = p
End Function

