Attribute VB_Name = "IChartSurface"
Attribute VB_Base = "0{FCFB3D2A-A0FA-1068-A738-08002B3371B5}"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Attribute VB_TemplateDerived = False
Attribute VB_Customizable = False
'==================================================================================
' IChartSurface  -  Drawing interface the renderer talks to.
'
' This is the "canvas ctx" abstraction.  Concrete surfaces implement it:
'   clsGdiSurface   -> raster via GDI+ (also the text-measuring engine)
'   clsShapeSurface -> native, editable Office shapes on a worksheet
' Angles are GDI+ style: degrees, 0 = east (3 o'clock), increasing clockwise.
' Colours are packed 0xAARRGGBB Longs (see modColorUtil.ARGB / HexToArgb).
'==================================================================================
Option Explicit

Public Sub BeginImage(ByVal W As Long, ByVal H As Long)
End Sub

Public Sub FillRoundRect(ByVal x As Single, ByVal y As Single, ByVal W As Single, ByVal H As Single, ByVal r As Single, ByVal argb As Long)
End Sub

Public Sub FillWedge(ByVal cx As Single, ByVal cy As Single, ByVal rIn As Single, ByVal rOut As Single, ByVal startDeg As Single, ByVal sweepDeg As Single, ByVal fillArgb As Long, ByVal strokeArgb As Long, ByVal strokeW As Single)
End Sub

Public Sub StrokeLine(ByVal x1 As Single, ByVal y1 As Single, ByVal x2 As Single, ByVal y2 As Single, ByVal argb As Long, ByVal W As Single, ByVal roundCap As Boolean)
End Sub

Public Sub FillCircle(ByVal cx As Single, ByVal cy As Single, ByVal r As Single, ByVal argb As Long)
End Sub

Public Sub FillTriangle(ByVal x1 As Single, ByVal y1 As Single, ByVal x2 As Single, ByVal y2 As Single, ByVal x3 As Single, ByVal y3 As Single, ByVal argb As Long)
End Sub

Public Function MeasureTextWidth(ByVal text As String, ByVal fontPx As Single, ByVal bold As Boolean) As Single
End Function

Public Sub DrawCenteredText(ByVal text As String, ByVal cx As Single, ByVal cy As Single, ByVal fontPx As Single, ByVal bold As Boolean, ByVal argb As Long)
End Sub

' Like DrawCenteredText but the text is rotated by degrees (GDI+ style: clockwise
' positive) about its centre (cx, cy). Used for radial labels around the gauge.
Public Sub DrawRotatedText(ByVal text As String, ByVal cx As Single, ByVal cy As Single, ByVal fontPx As Single, ByVal bold As Boolean, ByVal argb As Long, ByVal degrees As Single)
End Sub

Public Sub SaveToFile(ByVal filePath As String)
End Sub

' Grouping markers. Raster/vector surfaces ignore these; the shape surface uses
' them to group the emitted native shapes (supports nesting / multi-level groups).
Public Sub BeginGroup(ByVal name As String)
End Sub

Public Sub EndGroup()
End Sub
