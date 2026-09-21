Attribute VB_Name = "modPastePicture"
'==================================================================================
' modPastePicture  -  Turns whatever is on the clipboard (an Enhanced Metafile or a
' bitmap, e.g. from Shape.CopyPicture) into a stdole IPicture that can be assigned to
' an MSForms.Image control. This is how the Graphs Maker form shows a live, vector
' preview of the gauge / line chart WITHOUT writing any image file (so it works even
' where GDI+ file export is blocked).
'
' VBA7 (Office 2010+), 32- or 64-bit. For Office 2007 remove "PtrSafe"/"LongPtr".
'==================================================================================
Option Explicit

Private Const CF_BITMAP As Long = 2
Private Const CF_ENHMETAFILE As Long = 14
Private Const IMAGE_BITMAP As Long = 0
Private Const LR_COPYRETURNORG As Long = &H4
Private Const PICTYPE_BITMAP As Long = 1
Private Const PICTYPE_ENHMETAFILE As Long = 4

Private Type uGUID
    Data1 As Long
    Data2 As Integer
    Data3 As Integer
    Data4(0 To 7) As Byte
End Type

Private Type uPicDesc
    Size As Long
    Type As Long
    hHandle As LongPtr
    hPalOrNull As LongPtr
End Type

Private Declare PtrSafe Function OpenClipboard Lib "user32" (ByVal hwnd As LongPtr) As Long
Private Declare PtrSafe Function CloseClipboard Lib "user32" () As Long
Private Declare PtrSafe Function EmptyClipboard Lib "user32" () As Long
Private Declare PtrSafe Function IsClipboardFormatAvailable Lib "user32" (ByVal wFormat As Long) As Long
Private Declare PtrSafe Function GetClipboardData Lib "user32" (ByVal wFormat As Long) As LongPtr
Private Declare PtrSafe Function CopyEnhMetaFile Lib "gdi32" Alias "CopyEnhMetaFileA" (ByVal hemfSrc As LongPtr, ByVal lpszFile As String) As LongPtr
Private Declare PtrSafe Function CopyImage Lib "user32" (ByVal handle As LongPtr, ByVal un1 As Long, ByVal n1 As Long, ByVal n2 As Long, ByVal un2 As Long) As LongPtr
Private Declare PtrSafe Function OleCreatePictureIndirect Lib "oleaut32" (PicDesc As uPicDesc, RefIID As uGUID, ByVal fOwn As Long, ipic As stdole.IPicture) As Long
Private Declare PtrSafe Function RegisterClipboardFormat Lib "user32" Alias "RegisterClipboardFormatA" (ByVal lpString As String) As Long
Private Declare PtrSafe Function GlobalLock Lib "kernel32" (ByVal hMem As LongPtr) As LongPtr
Private Declare PtrSafe Function GlobalUnlock Lib "kernel32" (ByVal hMem As LongPtr) As Long
Private Declare PtrSafe Function GlobalSize Lib "kernel32" (ByVal hMem As LongPtr) As LongPtr
Private Declare PtrSafe Sub CopyMemory Lib "kernel32" Alias "RtlMoveMemory" (ByRef Destination As Any, ByVal Source As LongPtr, ByVal Length As LongPtr)
Private Declare PtrSafe Sub Sleep Lib "kernel32" (ByVal ms As Long)
' --- diagnostics only (ClipboardDiag) ---
Private Declare PtrSafe Function GetOpenClipboardWindow Lib "user32" () As LongPtr
Private Declare PtrSafe Function GetClipboardOwner Lib "user32" () As LongPtr
Private Declare PtrSafe Function CountClipboardFormats Lib "user32" () As Long
Private Declare PtrSafe Function GetClassName Lib "user32" Alias "GetClassNameA" (ByVal hwnd As LongPtr, ByVal lpClassName As String, ByVal nMaxCount As Long) As Long
Private Declare PtrSafe Function GetWindowText Lib "user32" Alias "GetWindowTextA" (ByVal hwnd As LongPtr, ByVal lpString As String, ByVal cch As Long) As Long
Private Declare PtrSafe Function GetWindowThreadProcessId Lib "user32" (ByVal hwnd As LongPtr, ByRef lpdwProcessId As Long) As Long
Private Declare PtrSafe Function GetCurrentProcessId Lib "kernel32" () As Long
Private Declare PtrSafe Function GetClipboardSequenceNumber Lib "user32" () As Long

' --- OLE clipboard (ole32) -------------------------------------------------------
' THE ROOT-CAUSE APIs. Shape.CopyPicture does NOT put pixels on the clipboard: Excel
' publishes an IDataObject through OleSetClipboard and advertises CF_ENHMETAFILE /
' CF_BITMAP / its own formats with NULL handles - a DELAYED-RENDER PROMISE that
' points back at the live shape group on the scratch sheet. Nothing is drawn until
' somebody asks for a format.
'
' user32's EmptyClipboard clears the clipboard's CONTENTS. It does not revoke that
' promise: ole32 keeps its own AddRef'd pointer to Excel's data object, and
' Application.CutCopyMode = False only cancels a RANGE copy (the marching ants), not
' a CopyPicture offer. So the old teardown left Excel promising to render a picture of
' shapes that EndTemp deleted a moment later, on a sheet it then made VeryHidden.
'
' Nothing notices until something runs the OLE clipboard shutdown/flush sequence -
' and closing a workbook does exactly that, so Excel's contents survive the closing
' document. Excel is then asked to realise the promised metafile from a shape group
' that no longer exists, and it wedges inside that render, retrying. Its message loop
' keeps running (Excel and other apps stay responsive) but the close never completes:
' spinning pointer, workbook still open. That is this bug, end to end.
'
' OleSetClipboard(NULL) is the documented revoke: it empties the clipboard AND
' releases the IDataObject, cheaply, without rendering anything. OleFlushClipboard is
' the fallback - it forces the render NOW (while the source shapes are still alive,
' which is the whole point of calling it before EndTemp) and then releases.
' Both must run on the thread that owns the OLE apartment; VBA runs on Excel's main
' STA, so calling them from here is correct.
Private Declare PtrSafe Function OleSetClipboard Lib "ole32" (ByVal pDataObj As LongPtr) As Long
Private Declare PtrSafe Function OleFlushClipboard Lib "ole32" () As Long

' Opens the clipboard, retrying briefly instead of failing on the first refusal. The
' clipboard is process-global: another app (e.g. a browser the user just switched to)
' often holds a transient lock, so a single OpenClipboard returns 0 and would leave the
' preview showing a stale frame. Retries for ~1 second, pumping messages between tries.
' tries defaults to 25 (~1 s). Callers that are only tidying up (ClearClipboard)
' pass a much smaller number: every attempt costs a DoEvents, and a DoEvents inside
' a render lets a queued click start a SECOND render on top of the first.
' pump = False drops the DoEvents. Use it on any teardown path (UserForm_QueryClose
' / _Terminate): a DoEvents inside a form's close handler lets Windows deliver
' queued messages into a half-unloaded form, and a form stuck half-unloaded is one
' of the states that makes Excel report itself BUSY to incoming DDE / COM calls -
' which is what stops a workbook from opening or closing.
Private Function OpenClipboardRetry(Optional ByVal tries As Long = 25, _
                                    Optional ByVal pump As Boolean = True) As Boolean
    Dim i As Long
    For i = 1 To tries
        If OpenClipboard(0) <> 0 Then
            OpenClipboardRetry = True
            Exit Function
        End If
        If pump Then DoEvents
        Sleep 40
    Next i
End Function

' Revokes any OLE clipboard offer THIS PROCESS is publishing - i.e. the delayed-render
' picture promise Shape.CopyPicture leaves behind - and releases the IDataObject
' behind it. This is the call the old code was missing, and the reason the hang
' survived every EmptyClipboard / CutCopyMode = False in the project.
'
' MUST be called while the copied shapes are still ALIVE. Once EndTemp has deleted
' them the promise can no longer be honoured, and OleFlushClipboard - which is what a
' workbook close ends up doing - is exactly the call that then hangs.
'
' Returns True when OLE reports the clipboard detached. Never raises.
Public Function RevokeOleClipboard() As Boolean
    Dim hr As Long, i As Long
    On Error Resume Next
    For i = 1 To 3
        hr = OleSetClipboard(0)                   ' empty + Release(IDataObject), no render
        If hr = 0 Then
            RevokeOleClipboard = True
            Exit Function
        End If
        ' CLIPBRD_E_CANT_OPEN / _CANT_EMPTY: somebody holds the clipboard for a moment.
        ' Flush instead - it renders the promised formats while the SOURCE IS STILL
        ' THERE and releases the data object, which removes the dangling promise even
        ' though the (now real) data stays on the clipboard.
        OleFlushClipboard
        Sleep 30
    Next i
    On Error GoTo 0
End Function

' Empties the clipboard (through the same tolerant open). Call this BEFORE a fresh
' Shape.CopyPicture so that, if the copy silently fails to update the clipboard (which
' happens when Excel is not the foreground window - e.g. behind a full-screen modal
' form), PastePicture returns Nothing instead of re-reading the previous, stale frame.
' Also call it AFTER the paste, to drop Excel's delayed-render claim on shapes that
' are about to be deleted (see frmCostbooks.ShowPreview).
'
' Order matters: the OLE revoke goes FIRST. Emptying the Windows clipboard while
' ole32 still holds Excel's data object is precisely the half-release that produced
' this bug - the contents go, the promise stays.
'
' tries: 5 (~0.2 s) between previews, where a long DoEvents loop would let a queued
' click start a second render. Pass a bigger budget where correctness matters more
' than speed - notably the LAST release before the form goes away.
' Returns False when it could not confirm the clipboard is clean.
Public Function ClearClipboard(Optional ByVal tries As Long = 5, _
                               Optional ByVal pump As Boolean = True) As Boolean
    Dim revoked As Boolean
    revoked = RevokeOleClipboard()                ' 1. drop the delayed-render promise
    If OpenClipboardRetry(tries, pump) Then       ' 2. and the raw contents
        EmptyClipboard
        CloseClipboard
        ClearClipboard = True
    Else
        ' The OLE revoke already empties the clipboard on success, so a refused
        ' OpenClipboard afterwards is not a failure of the thing that matters.
        ClearClipboard = revoked
    End If
End Function

' The belt-and-braces release: drops Excel's own copy mode, revokes the OLE offer and
' empties the OS clipboard, trying hard, then VERIFIES the result instead of hoping.
' Call it whenever the tool is done with the clipboard for good - and always before
' anything deletes the shapes a CopyPicture may still point at.
' Pass pump:=False on form-teardown paths (a DoEvents inside a close handler delivers
' queued messages into a half-unloaded form).
' Returns True when no process is left advertising clipboard data.
Public Function ReleaseClipboard(Optional ByVal pump As Boolean = True) As Boolean
    Dim i As Long
    On Error Resume Next
    Application.CutCopyMode = False               ' cancels a RANGE copy only - not this
    On Error GoTo 0

    For i = 1 To 3
        ClearClipboard 25, pump
        If Not ClipboardOwnedByThisProcess() Then
            ReleaseClipboard = True
            Exit Function
        End If
        RevokeOleClipboard
        Sleep 40
    Next i
End Function

' True when a window of THIS Excel process is still the clipboard owner - i.e. we are
' still promising to render something. Zero owner, or an owner in another process,
' both mean this tool has nothing outstanding. This is the only honest way to tell a
' successful release from a silent one, and the old code checked nothing.
Public Function ClipboardOwnedByThisProcess() As Boolean
    Dim H As LongPtr, pid As Long
    On Error Resume Next
    H = GetClipboardOwner()
    If H = 0 Then Exit Function
    GetWindowThreadProcessId H, pid
    ClipboardOwnedByThisProcess = (pid = GetCurrentProcessId())
    On Error GoTo 0
End Function

' Rescue: if OUR process leaked an OpenClipboard (opened it and never closed it),
' CloseClipboard from this same process releases it - a lock can only be closed by
' the process holding it, and VBA runs inside Excel. Harmless when we don't hold it
' (CloseClipboard just fails). Does nothing for a lock held by another process.
' Returns True when the clipboard is openable afterwards.
Public Function ForceCloseClipboard() As Boolean
    Dim i As Long
    On Error Resume Next
    For i = 1 To 8                                ' nested opens need one close each
        If GetOpenClipboardWindow() = 0 Then Exit For
        CloseClipboard
    Next i
    If OpenClipboard(0) <> 0 Then
        CloseClipboard
        ForceCloseClipboard = True
    End If
    On Error GoTo 0
End Function

'=============================== diagnostics ====================================
' Who currently holds the Windows clipboard, and what is on it. Read by
' modTpcDiagnostics.TpcState.
'
' The clipboard is a single, machine-wide, exclusively-locked resource. If ANY
' process calls OpenClipboard and never calls CloseClipboard, every other
' clipboard call in Windows blocks - and Excel touches the clipboard when it opens
' a workbook and when it closes one. That is the shape of "Excel still responds,
' but no file will open or close, and the pointer spins", and it is invisible to
' every Application-level flag, which is why the first diagnostic pass came back
' clean. GetOpenClipboardWindow names the holder outright: 0 means nobody has it
' open and the clipboard is NOT the problem.
Public Function ClipboardDiag() As String
    Dim s As String, H As LongPtr, pid As Long
    On Error Resume Next

    H = GetOpenClipboardWindow()
    If H = 0 Then
        s = s & "  Held open by      : nobody (0) - clipboard is NOT blocked" & vbCrLf
    Else
        s = s & "  *** HELD OPEN BY  : " & WinDesc(H) & "  <-- this blocks Excel" & vbCrLf
    End If

    H = GetClipboardOwner()
    s = s & "  Owner (put data)  : " & IIf(H = 0, "none (0)", WinDesc(H)) & vbCrLf
    If ClipboardOwnedByThisProcess() Then
        s = s & "  *** THIS EXCEL still OWNS the clipboard - a delayed-render promise" & vbCrLf & _
                "      is outstanding. If the shapes behind it are gone, the next" & vbCrLf & _
                "      workbook close will hang flushing it. Run TpcReset." & vbCrLf
    Else
        s = s & "  Owned by us       : no (good - nothing outstanding)" & vbCrLf
    End If
    s = s & "  Formats on it     : " & CountClipboardFormats() & vbCrLf
    s = s & "  CF_ENHMETAFILE    : " & (IsClipboardFormatAvailable(CF_ENHMETAFILE) <> 0) & vbCrLf
    s = s & "  CF_BITMAP         : " & (IsClipboardFormatAvailable(CF_BITMAP) <> 0) & vbCrLf

    ' can WE take it right now? one try, no waiting - this is the same call Excel
    ' has to make, so a failure here is a failure there
    If OpenClipboard(0) <> 0 Then
        CloseClipboard
        s = s & "  OpenClipboard now : OK" & vbCrLf
    Else
        s = s & "  *** OpenClipboard now : FAILED - the clipboard is locked" & vbCrLf
    End If

    On Error GoTo 0
    ClipboardDiag = s
End Function

' "hwnd 0x1234 class=XLMAIN pid=9876 text=..." for a window handle.
Private Function WinDesc(ByVal hwnd As LongPtr) As String
    Dim cls As String, txt As String, pid As Long, n As Long
    On Error Resume Next
    cls = String$(256, vbNullChar)
    n = GetClassName(hwnd, cls, 255)
    cls = Left$(cls, n)
    txt = String$(256, vbNullChar)
    n = GetWindowText(hwnd, txt, 255)
    txt = Left$(txt, n)
    GetWindowThreadProcessId hwnd, pid
    On Error GoTo 0
    WinDesc = "hwnd=" & CStr(hwnd) & "  class=" & cls & "  pid=" & pid & _
              IIf(Len(txt) > 0, "  text=""" & txt & """", "")
End Function

' Saves the clipboard's native "PNG" image (the format produced by Shape.Copy in
' Office 2016+) straight to disk with NO re-rasterisation, so the chart keeps full
' quality. Returns False if the clipboard has no PNG (older Office) - the caller can
' then fall back to Chart.Export.
Public Function SaveClipboardPngToFile(ByVal path As String) As Boolean
    Dim fmt As Long, hMem As LongPtr, ptr As LongPtr, sz As LongPtr
    fmt = RegisterClipboardFormat("PNG")
    If fmt = 0 Then Exit Function
    If IsClipboardFormatAvailable(fmt) = 0 Then Exit Function
    If Not OpenClipboardRetry() Then Exit Function

    ' From here on the clipboard is OPEN and it is process-global: leaving it open
    ' (a ReDim that overflows, any other raised error) locks the clipboard for the
    ' whole machine, and every app that touches it - including Excel closing a
    ' workbook - then hangs on a busy pointer. Nothing may escape without closing.
    On Error GoTo CloseAndExit

    hMem = GetClipboardData(fmt)
    If hMem <> 0 Then
        sz = GlobalSize(hMem)
        ptr = GlobalLock(hMem)
        If ptr <> 0 And sz > 0 Then
            Dim b() As Byte
            ReDim b(0 To CLng(sz) - 1)
            CopyMemory b(0), ptr, sz
            GlobalUnlock hMem

            Dim fn As Integer
            On Error Resume Next
            If Len(dir(path)) > 0 Then Kill path
            fn = FreeFile
            Open path For Binary Access Write As #fn
            Put #fn, , b
            Close #fn
            On Error GoTo 0
        End If
    End If
CloseAndExit:
    CloseClipboard

    On Error Resume Next
    SaveClipboardPngToFile = (FileLen(path) > 0)
    On Error GoTo 0
End Function

' Returns a Picture built from the clipboard contents, or Nothing if the clipboard
' holds neither an enhanced metafile nor a bitmap.
Public Function PastePicture() As stdole.IPicture
    Dim picType As Long, hSrc As LongPtr, hCopy As LongPtr

    If IsClipboardFormatAvailable(CF_ENHMETAFILE) <> 0 Then
        picType = CF_ENHMETAFILE
    ElseIf IsClipboardFormatAvailable(CF_BITMAP) <> 0 Then
        picType = CF_BITMAP
    Else
        Exit Function
    End If

    If Not OpenClipboardRetry() Then Exit Function
    hSrc = GetClipboardData(picType)
    ' Own our own copy of the handle so closing the clipboard doesn't invalidate it.
    If picType = CF_BITMAP Then
        hCopy = CopyImage(hSrc, IMAGE_BITMAP, 0, 0, LR_COPYRETURNORG)
    Else
        hCopy = CopyEnhMetaFile(hSrc, vbNullString)
    End If
    CloseClipboard
    If hCopy = 0 Then Exit Function

    Set PastePicture = CreatePicture(hCopy, _
        IIf(picType = CF_BITMAP, PICTYPE_BITMAP, PICTYPE_ENHMETAFILE))
End Function

' Wraps a GDI handle in a stdole picture via OleCreatePictureIndirect.
Private Function CreatePicture(ByVal hPic As LongPtr, ByVal picType As Long) As stdole.IPicture
    Dim pd As uPicDesc, iid As uGUID, ip As stdole.IPicture

    ' IID_IPicture = {7BF80980-BF32-101A-8BBB-00AA00300CAB}
    iid.Data1 = &H7BF80980
    iid.Data2 = &HBF32
    iid.Data3 = &H101A
    iid.Data4(0) = &H8B: iid.Data4(1) = &HBB
    iid.Data4(2) = &H0: iid.Data4(3) = &HAA
    iid.Data4(4) = &H0: iid.Data4(5) = &H30
    iid.Data4(6) = &HC: iid.Data4(7) = &HAB

    pd.Size = LenB(pd)
    pd.Type = picType
    pd.hHandle = hPic
    pd.hPalOrNull = 0

    If OleCreatePictureIndirect(pd, iid, 1, ip) = 0 Then Set CreatePicture = ip
End Function
