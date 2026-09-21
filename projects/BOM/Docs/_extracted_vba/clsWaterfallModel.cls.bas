Attribute VB_Name = "clsWaterfallModel"
Attribute VB_Base = "0{FCFB3D2A-A0FA-1068-A738-08002B3371B5}"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Attribute VB_TemplateDerived = False
Attribute VB_Customizable = False
'==================================================================================
' clsWaterfallModel  -  Comparative Analysis (page 2): 2..3 carline totals drawn
' as STACKED bars (split by the "Split Selection" column) bridged by waterfall
' steps (the per-"Level Selection" gaps between consecutive carlines).
'
'   Cars:      1..CarCount, each a stacked total (same segment list for all cars,
'              so colours line up; a segment value may be 0 for a car).
'   Segments:  1..SegCount  (split categories, e.g. Powertrain/Platform/...)
'   Steps:     between car c and c+1: 1..StepCount(c) gaps, biggest first,
'              grouped into "Other" by the caller when there are > 10.
'==================================================================================
Option Explicit

Public widthPx As Single
Public heightPx As Single

Private mCarLabels() As String       ' 1..nCars
Private mSegLabels() As String       ' 1..nSegs
Private mSegColors() As Long         ' 1..nSegs
Private mSegVals() As Double         ' (1..nCars, 1..nSegs)
Private mSteps As Collection         ' item c = 2D Variant (1..k, 1..2): label, delta
Private mNCars As Long
Private mNSegs As Long

Private Sub Class_Initialize()
    widthPx = 1600
    heightPx = 700
    Set mSteps = New Collection
End Sub

Public Sub SetSize(ByVal nCars As Long, ByVal nSegs As Long)
    mNCars = nCars: mNSegs = nSegs
    ReDim mCarLabels(1 To nCars)
    ReDim mSegLabels(1 To IIf(nSegs < 1, 1, nSegs))
    ReDim mSegColors(1 To IIf(nSegs < 1, 1, nSegs))
    ReDim mSegVals(1 To nCars, 1 To IIf(nSegs < 1, 1, nSegs))
    Set mSteps = New Collection
End Sub

Public Property Get CarCount() As Long
    CarCount = mNCars
End Property
Public Property Get SegCount() As Long
    SegCount = mNSegs
End Property

Public Property Get CarLabel(ByVal c As Long) As String
    CarLabel = mCarLabels(c)
End Property
Public Property Let CarLabel(ByVal c As Long, ByVal v As String)
    mCarLabels(c) = v
End Property

Public Property Get SegLabel(ByVal s As Long) As String
    SegLabel = mSegLabels(s)
End Property
Public Property Let SegLabel(ByVal s As Long, ByVal v As String)
    mSegLabels(s) = v
End Property

Public Property Get SegColor(ByVal s As Long) As Long
    SegColor = mSegColors(s)
End Property
Public Property Let SegColor(ByVal s As Long, ByVal v As Long)
    mSegColors(s) = v
End Property

Public Property Get SegValue(ByVal c As Long, ByVal s As Long) As Double
    SegValue = mSegVals(c, s)
End Property
Public Property Let SegValue(ByVal c As Long, ByVal s As Long, ByVal v As Double)
    mSegVals(c, s) = v
End Property

Public Function CarTotal(ByVal c As Long) As Double
    Dim s As Long
    For s = 1 To mNSegs
        CarTotal = CarTotal + mSegVals(c, s)
    Next s
End Function

' steps between car c and c+1: a 2D Variant (1..k, 1..2) = label, delta.
' Add them in car order (c = 1 first).
Public Sub AddSteps(ByVal stepsArr As Variant)
    mSteps.Add stepsArr
End Sub

Public Function StepCount(ByVal c As Long) As Long
    If c > mSteps.Count Then Exit Function
    If Not IsArray(mSteps(c)) Then Exit Function
    StepCount = UBound(mSteps(c), 1)
End Function

Public Function StepLabel(ByVal c As Long, ByVal k As Long) As String
    StepLabel = CStr(mSteps(c)(k, 1))
End Function

Public Function StepDelta(ByVal c As Long, ByVal k As Long) As Double
    StepDelta = CDbl(mSteps(c)(k, 2))
End Function
