Attribute VB_Name = "clsShapeSurface"
Attribute VB_Base = "0{FCFB3D2A-A0FA-1068-A738-08002B3371B5}"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Attribute VB_TemplateDerived = False
Attribute VB_Customizable = False
'==================================================================================
' clsShapeSurface  -  IChartSurface implementation that emits NATIVE Office shapes
' (into an Excel worksheet's Shapes collection) instead of pixels, so each chart
' (waterfall / bars / pie / line) comes out as fully editable, grouped objects.
'
' BeginGroup/EndGroup build real shape groups and may nest (multi-level grouping):
' e.g. a value label + its background is one group, the legend is one group, etc.
' Coordinates arrive in the renderer's pixel space and are scaled to points and
' offset to the requested position on the sheet. Text widths are measured with a
' throwaway GDI+ surface so positions match the raster render.
'==================================================================================
Option Explicit

Implements IChartSurface

' --- mso enum values we use (late-bound, so no Office reference needed) ---
Private Const msoShapeRectangle As Long = 1
Private Const msoShapeRoundedRectangle As Long = 5
Private Const msoShapeOval As Long = 9
Private Const msoTextOrientationHorizontal As Long = 1
Private Const msoEditingCorner As Long = 1
Private Const msoSegmentLine As Long = 0
Private Const msoFalse As Long = 0
Private Const msoTrue As Long = -1
Private Const msoAlignCenter As Long = 2
Private Const msoAnchorMiddle As Long = 3
Private Const msoAutoSizeNone As Long = 0

Private mShapes As Object          ' target Shapes collection (ws.Shapes)
Private mOriginX As Single         ' placement on the sheet, in points
Private mOriginY As Single
Private mTargetWPt As Single       ' desired drawn width, in points
Private mScale As Single           ' points per pixel
Private mCanvasW As Long
Private mCanvasH As Long
Private mPrefix As String          ' unique name prefix (per run + graph)
Private mSeq As Long
Private mStack As Collection       ' stack of Collections (each = child shape names)
Private mLevelName As Collection   ' parallel stack of group names
Private mMeasurer As IChartSurface ' GDI+ surface used only to measure text widths
Private mLastTopName As String     ' name of the last completed TOP-level group/shape

' Name of the outermost group produced by the matching BeginGroup/EndGroup pair
' (e.g. the whole "Gauge" or "LineChart" group). Lets a caller grab the group as a
' single shape - e.g. to CopyPicture/export it.
Public Property Get LastGroupName() As String
    LastGroupName = mLastTopName
End Property

' Set up before rendering. tag must differ per graph so shape names stay unique.
Public Sub Init(ByVal targetShapes As Object, ByVal originXpt As Single, ByVal originYpt As Single, ByVal targetWidthPt As Single, ByVal tag As String)
    Set mShapes = targetShapes
    mOriginX = originXpt
    mOriginY = originYpt
    mTargetWPt = targetWidthPt
    mPrefix = "TPCG_" & tag & "_"
    mSeq = 0
    Set mStack = New Collection
    Set mLevelName = New Collection
    Set mMeasurer = New clsGdiSurface
End Sub

Public Property Get RenderedWidthPt() As Single
    RenderedWidthPt = mTargetWPt
End Property

Public Property Get RenderedHeightPt() As Single
    RenderedHeightPt = mCanvasH * mScale
End Property

'================================ IChartSurface ================================
Private Sub IChartSurface_BeginImage(ByVal W As Long, ByVal H As Long)
    mCanvasW = W: mCanvasH = H
    If mTargetWPt <= 0 Then mTargetWPt = 360
    mScale = mTargetWPt / W
End Sub

Private Sub IChartSurface_FillRoundRect(ByVal x As Single, ByVal y As Single, ByVal W As Single, ByVal H As Single, ByVal r As Single, ByVal argb As Long)
    Dim shp As Object, mn As Single, adj As Single
    Set shp = mShapes.AddShape(msoShapeRoundedRectangle, ptX(x), ptY(y), sc(W), sc(H))
    mn = W: If H < mn Then mn = H
    If mn > 0 Then adj = r / mn
    If adj > 0.5 Then adj = 0.5
    On Error Resume Next
    shp.Adjustments(1) = adj
    On Error GoTo 0
    ApplyFill shp, argb
    shp.Line.Visible = msoFalse
    Reg shp
End Sub

Private Sub IChartSurface_FillWedge(ByVal cx As Single, ByVal cy As Single, ByVal rIn As Single, ByVal rOut As Single, ByVal startDeg As Single, ByVal sweepDeg As Single, ByVal fillArgb As Long, ByVal strokeArgb As Long, ByVal strokeW As Single)
    Dim n As Long, i As Long, stepA As Single, a As Single
    Dim fb As Object, shp As Object
    n = Int(Abs(sweepDeg) / 3#) + 2
    stepA = sweepDeg / n
    Set fb = mShapes.BuildFreeform(msoEditingCorner, ArcX(cx, rOut, startDeg), ArcY(cy, rOut, startDeg))
    For i = 1 To n
        a = startDeg + stepA * i
        fb.AddNodes msoSegmentLine, msoEditingCorner, ArcX(cx, rOut, a), ArcY(cy, rOut, a)
    Next i
    For i = n To 0 Step -1
        a = startDeg + stepA * i
        fb.AddNodes msoSegmentLine, msoEditingCorner, ArcX(cx, rIn, a), ArcY(cy, rIn, a)
    Next i
    Set shp = fb.ConvertToShape
    ApplyFill shp, fillArgb
    ApplyStroke shp, strokeArgb, strokeW
    Reg shp
End Sub

Private Sub IChartSurface_StrokeLine(ByVal x1 As Single, ByVal y1 As Single, ByVal x2 As Single, ByVal y2 As Single, ByVal argb As Long, ByVal W As Single, ByVal roundCap As Boolean)
    Dim shp As Object
    Set shp = mShapes.AddLine(ptX(x1), ptY(y1), ptX(x2), ptY(y2))
    ApplyStroke shp, argb, W
    Reg shp
End Sub

Private Sub IChartSurface_FillCircle(ByVal cx As Single, ByVal cy As Single, ByVal r As Single, ByVal argb As Long)
    Dim shp As Object
    Set shp = mShapes.AddShape(msoShapeOval, ptX(cx - r), ptY(cy - r), sc(2 * r), sc(2 * r))
    ApplyFill shp, argb
    shp.Line.Visible = msoFalse
    Reg shp
End Sub

Private Sub IChartSurface_FillTriangle(ByVal x1 As Single, ByVal y1 As Single, ByVal x2 As Single, ByVal y2 As Single, ByVal x3 As Single, ByVal y3 As Single, ByVal argb As Long)
    Dim fb As Object, shp As Object
    Set fb = mShapes.BuildFreeform(msoEditingCorner, ptX(x1), ptY(y1))
    fb.AddNodes msoSegmentLine, msoEditingCorner, ptX(x2), ptY(y2)
    fb.AddNodes msoSegmentLine, msoEditingCorner, ptX(x3), ptY(y3)
    Set shp = fb.ConvertToShape
    ApplyFill shp, argb
    shp.Line.Visible = msoFalse
    Reg shp
End Sub

Private Function IChartSurface_MeasureTextWidth(ByVal text As String, ByVal fontPx As Single, ByVal bold As Boolean) As Single
    IChartSurface_MeasureTextWidth = mMeasurer.MeasureTextWidth(text, fontPx, bold)
End Function

Private Sub IChartSurface_DrawCenteredText(ByVal text As String, ByVal cx As Single, ByVal cy As Single, ByVal fontPx As Single, ByVal bold As Boolean, ByVal argb As Long)
    Reg EmitText(text, cx, cy, fontPx, bold, argb, 0)
End Sub

Private Sub IChartSurface_DrawRotatedText(ByVal text As String, ByVal cx As Single, ByVal cy As Single, ByVal fontPx As Single, ByVal bold As Boolean, ByVal argb As Long, ByVal degrees As Single)
    Reg EmitText(text, cx, cy, fontPx, bold, argb, degrees)
End Sub

Private Sub IChartSurface_SaveToFile(ByVal filePath As String)
    ' Shapes are already on the sheet; nothing to save.
End Sub

Private Sub IChartSurface_BeginGroup(ByVal name As String)
    mStack.Add New Collection
    mLevelName.Add name
End Sub

Private Sub IChartSurface_EndGroup()
    If mStack.Count = 0 Then Exit Sub
    Dim lvl As Collection, nm As String, cnt As Long, resultName As String
    Set lvl = mStack(mStack.Count)
    nm = mLevelName(mLevelName.Count)
    mStack.Remove mStack.Count
    mLevelName.Remove mLevelName.Count

    cnt = lvl.Count
    If cnt = 0 Then
        Exit Sub
    ElseIf cnt = 1 Then
        resultName = lvl(1)
    Else
        Dim arr() As Variant, i As Long, grp As Object
        ReDim arr(0 To cnt - 1)
        For i = 1 To cnt: arr(i - 1) = lvl(i): Next i
        Set grp = mShapes.Range(arr).Group
        mSeq = mSeq + 1
        grp.name = mPrefix & "grp" & mSeq & "_" & nm
        resultName = grp.name
    End If
    If mStack.Count > 0 Then
        mStack(mStack.Count).Add resultName
    Else
        mLastTopName = resultName               ' outermost group just closed
    End If
End Sub

'================================ helpers ======================================
Private Function ptX(ByVal px As Single) As Single
    ptX = mOriginX + px * mScale
End Function
Private Function ptY(ByVal py As Single) As Single
    ptY = mOriginY + py * mScale
End Function
Private Function sc(ByVal lenPx As Single) As Single
    sc = lenPx * mScale
End Function
Private Function ArcX(ByVal cx As Single, ByVal r As Single, ByVal DEG As Single) As Single
    ArcX = ptX(cx + r * Cos(DEG * PI / 180#))
End Function
Private Function ArcY(ByVal cy As Single, ByVal r As Single, ByVal DEG As Single) As Single
    ArcY = ptY(cy + r * Sin(DEG * PI / 180#))
End Function

' Assigns a unique name and registers the shape in the current group level.
Private Sub Reg(ByVal shp As Object)
    mSeq = mSeq + 1
    Dim nm As String
    nm = mPrefix & mSeq
    shp.name = nm
    If mStack.Count > 0 Then mStack(mStack.Count).Add nm
End Sub

Private Sub ApplyFill(ByVal shp As Object, ByVal argb As Long)
    Dim a As Long, r As Long, g As Long, b As Long
    UnpackArgb argb, a, r, g, b
    shp.Fill.Solid
    shp.Fill.ForeColor.RGB = RGB(r, g, b)
    shp.Fill.Transparency = 1 - a / 255#
End Sub

Private Sub ApplyStroke(ByVal shp As Object, ByVal argb As Long, ByVal W As Single)
    Dim a As Long, r As Long, g As Long, b As Long
    UnpackArgb argb, a, r, g, b
    shp.Line.Visible = msoTrue
    shp.Line.ForeColor.RGB = RGB(r, g, b)
    shp.Line.Weight = sc(W)
    shp.Line.Transparency = 1 - a / 255#
End Sub

' Creates a transparent, centred text box at (cx,cy) (pixels), optionally rotated.
Private Function EmitText(ByVal text As String, ByVal cx As Single, ByVal cy As Single, ByVal fontPx As Single, ByVal bold As Boolean, ByVal argb As Long, ByVal rotDeg As Single) As Object
    Dim tw As Single, boxW As Single, boxH As Single, shp As Object
    tw = mMeasurer.MeasureTextWidth(text, fontPx, bold)
    boxW = sc(tw) + sc(fontPx) * 0.8
    boxH = sc(fontPx) * 1.7
    Set shp = mShapes.AddTextbox(msoTextOrientationHorizontal, ptX(cx) - boxW / 2, ptY(cy) - boxH / 2, boxW, boxH)
    With shp.TextFrame2
        .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
        .WordWrap = msoFalse
        .AutoSize = msoAutoSizeNone
        .VerticalAnchor = msoAnchorMiddle
        With .TextRange
            .text = text
            .ParagraphFormat.Alignment = msoAlignCenter
            .font.name = "Segoe UI"
            .font.Size = sc(fontPx)
            .font.bold = IIf(bold, msoTrue, msoFalse)
            Dim a As Long, r As Long, g As Long, b As Long
            UnpackArgb argb, a, r, g, b
            .font.Fill.ForeColor.RGB = RGB(r, g, b)
        End With
    End With
    shp.Fill.Visible = msoFalse
    shp.Line.Visible = msoFalse
    If rotDeg <> 0 Then shp.Rotation = rotDeg
    Set EmitText = shp
End Function
