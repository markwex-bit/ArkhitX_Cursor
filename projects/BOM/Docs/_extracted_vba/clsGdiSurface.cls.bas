Attribute VB_Name = "clsGdiSurface"
Attribute VB_Base = "0{FCFB3D2A-A0FA-1068-A738-08002B3371B5}"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Attribute VB_TemplateDerived = False
Attribute VB_Customizable = False
'==================================================================================
' clsGdiSurface  -  IChartSurface implemented with GDI+ -> anti-aliased PNG.
' Produces a transparent-background 32bpp ARGB raster of any chart.
'
' In the shapes pipeline its main job is TEXT MEASUREMENT: clsShapeSurface creates a
' throwaway clsGdiSurface purely to call MeasureTextWidth, so vector label positions
' match a raster render. (It can also rasterise a chart to PNG, but GdipSaveImageToFile
' is blocked on some locked-down VMs - hence the ChartObject/clipboard fallbacks below.)
'==================================================================================
Option Explicit

Implements IChartSurface

Private mImage As LongPtr
Private mGfx As LongPtr
Private mW As Long              ' pixel size of the live bitmap (for the ChartObject
Private mH As Long             ' export fallback, which needs a 1:1 canvas)
Private mMeasImg As LongPtr     ' tiny throwaway context so text can be measured
Private mMeasGfx As LongPtr     ' before the real image exists (canvas sizing pass)
Private Const FONT_NAME As String = "Segoe UI"

'-------------------------------------------------------------------------------
' Free any GDI+ objects this instance still holds. Critical for the measure-only
' use (clsShapeSurface's throwaway measurer never calls BeginImage or the save path,
' so without this its tiny measuring bitmap + graphics context leak on every render -
' which exhausts GDI+ and raises "Out of memory" under rapid re-renders). The shared
' GdiplusStartup token is module-level and reused by other live surfaces, so it is NOT
' shut down here; it is released once when Excel exits.
Private Sub Class_Terminate()
    If mMeasGfx <> 0 Then GdipDeleteGraphics mMeasGfx: mMeasGfx = 0
    If mMeasImg <> 0 Then GdipDisposeImage mMeasImg: mMeasImg = 0
    If mGfx <> 0 Then GdipDeleteGraphics mGfx: mGfx = 0
    If mImage <> 0 Then GdipDisposeImage mImage: mImage = 0
End Sub

'-------------------------------------------------------------------------------
Private Sub IChartSurface_BeginImage(ByVal W As Long, ByVal H As Long)
    Dim st As Long
    If Not GdipStart() Then Err.Raise vbObjectError + 1, , "GDI+ failed to initialise (GdiplusStartup)."
    ' Release any measuring context now that the real image is being created.
    If mMeasGfx <> 0 Then GdipDeleteGraphics mMeasGfx: mMeasGfx = 0
    If mMeasImg <> 0 Then GdipDisposeImage mMeasImg: mMeasImg = 0
    st = GdipCreateBitmapFromScan0(W, H, 0, PixelFormat32bppARGB, 0, mImage)
    If st <> 0 Or mImage = 0 Then Err.Raise vbObjectError + 2, , "GdipCreateBitmapFromScan0 failed, status=" & st & " (" & GdipStatusText(st) & ")"
    mW = W: mH = H
    st = GdipGetImageGraphicsContext(mImage, mGfx)
    If st <> 0 Or mGfx = 0 Then Err.Raise vbObjectError + 3, , "GdipGetImageGraphicsContext failed, status=" & st & " (" & GdipStatusText(st) & ")"
    GdipSetSmoothingMode mGfx, SmoothingModeAntiAlias
    GdipSetPixelOffsetMode mGfx, PixelOffsetModeHighQuality
    GdipSetTextRenderingHint mGfx, TextRenderingHintAntiAlias
End Sub

Private Sub IChartSurface_FillRoundRect(ByVal x As Single, ByVal y As Single, ByVal W As Single, ByVal H As Single, ByVal r As Single, ByVal argb As Long)
    Dim p As LongPtr, br As LongPtr
    p = RoundRectPath(x, y, W, H, r)
    GdipCreateSolidFill argb, br
    GdipFillPath mGfx, br, p
    GdipDeleteBrush br
    GdipDeletePath p
End Sub

Private Sub IChartSurface_FillWedge(ByVal cx As Single, ByVal cy As Single, ByVal rIn As Single, ByVal rOut As Single, ByVal startDeg As Single, ByVal sweepDeg As Single, ByVal fillArgb As Long, ByVal strokeArgb As Long, ByVal strokeW As Single)
    Dim p As LongPtr, br As LongPtr, pn As LongPtr
    GdipCreatePath 0, p
    GdipAddPathArc p, cx - rOut, cy - rOut, 2 * rOut, 2 * rOut, startDeg, sweepDeg
    GdipAddPathArc p, cx - rIn, cy - rIn, 2 * rIn, 2 * rIn, startDeg + sweepDeg, -sweepDeg
    GdipClosePathFigure p
    GdipCreateSolidFill fillArgb, br
    GdipFillPath mGfx, br, p
    GdipCreatePen1 strokeArgb, strokeW, UnitPixel, pn
    GdipDrawPath mGfx, pn, p
    GdipDeletePen pn
    GdipDeleteBrush br
    GdipDeletePath p
End Sub

Private Sub IChartSurface_StrokeLine(ByVal x1 As Single, ByVal y1 As Single, ByVal x2 As Single, ByVal y2 As Single, ByVal argb As Long, ByVal W As Single, ByVal roundCap As Boolean)
    Dim pn As LongPtr
    GdipCreatePen1 argb, W, UnitPixel, pn
    If roundCap Then GdipSetPenLineCap197819 pn, LineCapRound, LineCapRound, 0
    GdipDrawLine mGfx, pn, x1, y1, x2, y2
    GdipDeletePen pn
End Sub

Private Sub IChartSurface_FillCircle(ByVal cx As Single, ByVal cy As Single, ByVal r As Single, ByVal argb As Long)
    Dim br As LongPtr
    GdipCreateSolidFill argb, br
    GdipFillEllipse mGfx, br, cx - r, cy - r, 2 * r, 2 * r
    GdipDeleteBrush br
End Sub

Private Sub IChartSurface_FillTriangle(ByVal x1 As Single, ByVal y1 As Single, ByVal x2 As Single, ByVal y2 As Single, ByVal x3 As Single, ByVal y3 As Single, ByVal argb As Long)
    Dim p As LongPtr, br As LongPtr
    GdipCreatePath 0, p
    GdipAddPathLine p, x1, y1, x2, y2
    GdipAddPathLine p, x2, y2, x3, y3
    GdipClosePathFigure p
    GdipCreateSolidFill argb, br
    GdipFillPath mGfx, br, p
    GdipDeleteBrush br
    GdipDeletePath p
End Sub

Private Function IChartSurface_MeasureTextWidth(ByVal text As String, ByVal fontPx As Single, ByVal bold As Boolean) As Single
    Dim fam As LongPtr, fnt As LongPtr, fmt As LongPtr, gfx As LongPtr
    Dim layout As GdipRectF, bounds As GdipRectF, fitted As Long, lines As Long
    gfx = MeasureGfx()
    MakeFont fontPx, bold, fam, fnt
    GdipCreateStringFormat 0, 0, fmt
    layout.width = 100000: layout.Height = 100000
    GdipMeasureString gfx, StrPtr(text), Len(text), fnt, layout, fmt, bounds, fitted, lines
    IChartSurface_MeasureTextWidth = bounds.width
    GdipDeleteStringFormat fmt
    GdipDeleteFont fnt
    GdipDeleteFontFamily fam
End Function

' The graphics context to measure against: the real image if it exists, otherwise
' a tiny throwaway context created on demand (used during the canvas-sizing pass,
' before BeginImage). BeginImage disposes the throwaway one.
Private Function MeasureGfx() As LongPtr
    If mGfx <> 0 Then MeasureGfx = mGfx: Exit Function
    If mMeasGfx = 0 Then
        If Not GdipStart() Then Err.Raise vbObjectError + 7, , "GDI+ failed to initialise (measure)."
        GdipCreateBitmapFromScan0 8, 8, 0, PixelFormat32bppARGB, 0, mMeasImg
        GdipGetImageGraphicsContext mMeasImg, mMeasGfx
        GdipSetTextRenderingHint mMeasGfx, TextRenderingHintAntiAlias
    End If
    MeasureGfx = mMeasGfx
End Function

Private Sub IChartSurface_DrawCenteredText(ByVal text As String, ByVal cx As Single, ByVal cy As Single, ByVal fontPx As Single, ByVal bold As Boolean, ByVal argb As Long)
    Dim fam As LongPtr, fnt As LongPtr, fmt As LongPtr, br As LongPtr
    Dim rc As GdipRectF
    MakeFont fontPx, bold, fam, fnt
    GdipCreateStringFormat 0, 0, fmt
    GdipSetStringFormatAlign fmt, StringAlignCenter      ' horizontal centre
    GdipSetStringFormatLineAlign fmt, StringAlignCenter  ' vertical (baseline) centre
    rc.Left = cx - 4000: rc.top = cy - 1000: rc.width = 8000: rc.Height = 2000
    GdipCreateSolidFill argb, br
    GdipDrawString mGfx, StrPtr(text), Len(text), fnt, rc, fmt, br
    GdipDeleteBrush br
    GdipDeleteStringFormat fmt
    GdipDeleteFont fnt
    GdipDeleteFontFamily fam
End Sub

Private Sub IChartSurface_DrawRotatedText(ByVal text As String, ByVal cx As Single, ByVal cy As Single, ByVal fontPx As Single, ByVal bold As Boolean, ByVal argb As Long, ByVal degrees As Single)
    Dim fam As LongPtr, fnt As LongPtr, fmt As LongPtr, br As LongPtr
    Dim rc As GdipRectF
    MakeFont fontPx, bold, fam, fnt
    GdipCreateStringFormat 0, 0, fmt
    GdipSetStringFormatAlign fmt, StringAlignCenter      ' horizontal centre
    GdipSetStringFormatLineAlign fmt, StringAlignCenter  ' vertical (baseline) centre
    rc.Left = -4000: rc.top = -1000: rc.width = 8000: rc.Height = 2000
    GdipCreateSolidFill argb, br
    ' Rotate about (cx, cy): translate origin there, then rotate, draw centred at 0,0.
    GdipTranslateWorldTransform mGfx, cx, cy, MatrixOrderPrepend
    GdipRotateWorldTransform mGfx, degrees, MatrixOrderPrepend
    GdipDrawString mGfx, StrPtr(text), Len(text), fnt, rc, fmt, br
    GdipResetWorldTransform mGfx
    GdipDeleteBrush br
    GdipDeleteStringFormat fmt
    GdipDeleteFont fnt
    GdipDeleteFontFamily fam
End Sub

' Grouping markers are meaningless for a raster surface.
Private Sub IChartSurface_BeginGroup(ByVal name As String)
End Sub
Private Sub IChartSurface_EndGroup()
End Sub

Private Sub IChartSurface_SaveToFile(ByVal filePath As String)
    Dim clsid As GdipGUID, st As Long, saveErr As String
    If mImage = 0 Then Err.Raise vbObjectError + 4, , "No image to save (mImage is null)."
    If Not GetPngEncoderClsid(clsid) Then Err.Raise vbObjectError + 5, , "PNG encoder CLSID not found."

    ' Clear any stale file of the same name (the template path reuses fixed names
    ' like TPC_gauge.png).
    KillIfExists filePath

    ' 1. Direct GDI+ save (fast path). IMPORTANT: GDI+ on some locked-down VMs creates
    '    the file but writes ZERO bytes and returns an error, so success must be judged
    '    by FileWritten (size > 0), never by file existence alone.
    st = GdipSaveImageToFile(mImage, StrPtr(filePath), clsid, 0)

    ' 2. GDI+ often fails with FileNotFound/Win32Error on UNC (\\server\...) and OneDrive
    '    placeholder paths even when the folder is writable by ordinary file I/O. Fall back
    '    to writing a LOCAL temp PNG, then copy it to the requested destination.
    If Not FileWritten(filePath) Then
        KillIfExists filePath                   ' remove any 0-byte leftover
        Dim tmpPng As String
        tmpPng = LocalTempPngPath()
        GdipSaveImageToFile mImage, StrPtr(tmpPng), clsid, 0
        If FileWritten(tmpPng) Then
            On Error Resume Next
            FileCopy tmpPng, filePath
            On Error GoTo 0
        End If
        KillIfExists tmpPng
    End If

    ' 3. Last resort: Excel's own image writer via a throwaway ChartObject. This
    '    succeeds where GdipSaveImageToFile is blocked entirely (it writes empty files
    '    on this VM). Must run while mImage is still alive. NOTE: it flattens onto a
    '    WHITE background (the clipboard bitmap carries no alpha), so the transparent
    '    corners around the white card become white.
    If Not FileWritten(filePath) Then
        KillIfExists filePath                   ' remove any 0-byte leftover
        ExportViaChart filePath
    End If

    If Not FileWritten(filePath) Then
        KillIfExists filePath
        saveErr = "Could not write the PNG by any method (GDI+ status=" & st & " - " & _
                  GdipStatusText(st) & "; GDI+ wrote an empty file, and the ChartObject " & _
                  "export fallback also failed)." & vbCrLf & "Path: " & filePath
    End If

    ' Always release GDI+ resources, even on failure.
    If mGfx <> 0 Then GdipDeleteGraphics mGfx: mGfx = 0
    If mImage <> 0 Then GdipDisposeImage mImage: mImage = 0
    mW = 0: mH = 0
    GdipStop

    If Len(saveErr) > 0 Then Err.Raise vbObjectError + 6, , saveErr
End Sub

' PNG writer that bypasses GdipSaveImageToFile entirely: copies the rendered bitmap
' to the clipboard, pastes it into a throwaway ChartObject, and uses Excel's own
' Chart.Export. Works in environments where GDI+ file writes are blocked. Returns
' True only if the file was actually produced. The image is flattened onto white.
Private Function ExportViaChart(ByVal filePath As String) As Boolean
    Dim ws As Object, cob As Object, cht As Object, pic As Object
    Dim prevSU As Boolean, restoreSU As Boolean
    On Error GoTo CleanFail

    Set ws = Application.ActiveSheet
    If ws Is Nothing Then Exit Function

    CopyImageToClipboard                        ' CF_BITMAP onto the clipboard (white bg)

    prevSU = Application.ScreenUpdating
    Application.ScreenUpdating = False
    restoreSU = True

    ' Start at the image's point-size (96 dpi: 1px = 0.75pt), then snap to the pasted
    ' picture so the chart frame matches it exactly (no padding / clipping).
    Set cob = ws.ChartObjects.Add(0, 0, IIf(mW > 0, mW * 0.75, 600), IIf(mH > 0, mH * 0.75, 400))
    Set cht = cob.Chart
    cob.Activate                                ' required, else the exported image is blank
    cob.Border.LineStyle = xlLineStyleNone
    cht.Paste

    ReleaseClipboard False                      ' the paste has consumed it - don't leave
                                                ' our CF_BITMAP (and Excel's own offer)
                                                ' sitting on the clipboard afterwards
    Set pic = cht.Shapes(cht.Shapes.Count)
    pic.Left = 0: pic.top = 0
    cob.width = pic.width
    cob.Height = pic.Height

    KillIfExists filePath                        ' Chart.Export won't overwrite cleanly
    cht.Export filePath, "PNG"
    cob.Delete
    Set cob = Nothing

    Application.ScreenUpdating = prevSU
    ExportViaChart = FileWritten(filePath)
    Exit Function
CleanFail:
    On Error Resume Next
    ReleaseClipboard False
    If Not cob Is Nothing Then cob.Delete
    If restoreSU Then Application.ScreenUpdating = prevSU
    On Error GoTo 0
    ExportViaChart = False
End Function

' True only if the file exists AND has content. GDI+ can leave a 0-byte file behind
' on failure, which must NOT be treated as a successful save.
Private Function FileWritten(ByVal p As String) As Boolean
    On Error Resume Next
    If Len(dir(p)) > 0 Then FileWritten = (FileLen(p) > 0)
    On Error GoTo 0
End Function

Private Sub KillIfExists(ByVal p As String)
    On Error Resume Next
    If Len(dir(p)) > 0 Then Kill p
    On Error GoTo 0
End Sub

' A guaranteed-local temp PNG path (used as a GDI+ save fallback when the real
' destination is a UNC / OneDrive placeholder path GDI+ refuses to write to).
Private Function LocalTempPngPath() As String
    Dim T As String
    T = Environ$("TEMP")
    If Len(T) = 0 Then T = Environ$("TMP")
    If Len(T) = 0 Then T = Environ$("USERPROFILE")
    LocalTempPngPath = T & "\TPCG_" & format$(Now, "yyyymmdd_hhnnss") & "_" & _
                       CLng((Timer * 1000#) - Int(Timer) * 1000#) & ".png"
End Function

' Human-readable text for the GDI+ Status enum (helps diagnose failures).
Private Function GdipStatusText(ByVal st As Long) As String
    Select Case st
        Case 0: GdipStatusText = "Ok"
        Case 1: GdipStatusText = "GenericError"
        Case 2: GdipStatusText = "InvalidParameter"
        Case 3: GdipStatusText = "OutOfMemory"
        Case 7: GdipStatusText = "Win32Error (bad path / access)"
        Case 10: GdipStatusText = "FileNotFound (folder missing)"
        Case 12: GdipStatusText = "AccessDenied"
        Case 18: GdipStatusText = "GdiplusNotInitialized"
        Case Else: GdipStatusText = "see GDI+ Status enum"
    End Select
End Function

Private Sub CopyImageToClipboard()
    Dim hbm As LongPtr, st As Long
    If mImage = 0 Then Err.Raise vbObjectError + 10, , "No image to copy (mImage is null)."
    ' Composite onto white so transparent corners don't turn black on the clipboard.
    st = GdipCreateHBITMAPFromBitmap(mImage, hbm, &HFFFFFFFF)
    If st <> 0 Or hbm = 0 Then Err.Raise vbObjectError + 11, , "GdipCreateHBITMAPFromBitmap failed, status=" & st

    If OpenClipboard(0) = 0 Then Err.Raise vbObjectError + 12, , "OpenClipboard failed."
    EmptyClipboard
    SetClipboardData CF_BITMAP, hbm         ' system takes ownership of hbm
    CloseClipboard
End Sub

'--- private helpers ----------------------------------------------------------
Private Function RoundRectPath(ByVal x As Single, ByVal y As Single, ByVal W As Single, ByVal H As Single, ByVal r As Single) As LongPtr
    Dim p As LongPtr, d As Single
    d = 2 * r
    GdipCreatePath 0, p
    GdipAddPathArc p, x, y, d, d, 180, 90
    GdipAddPathArc p, x + W - d, y, d, d, 270, 90
    GdipAddPathArc p, x + W - d, y + H - d, d, d, 0, 90
    GdipAddPathArc p, x, y + H - d, d, d, 90, 90
    GdipClosePathFigure p
    RoundRectPath = p
End Function

Private Sub MakeFont(ByVal fontPx As Single, ByVal bold As Boolean, ByRef fam As LongPtr, ByRef fnt As LongPtr)
    GdipCreateFontFamilyFromName StrPtr(FONT_NAME), 0, fam
    GdipCreateFont fam, fontPx, IIf(bold, FontStyleBold, FontStyleRegular), UnitPixel, fnt
End Sub

