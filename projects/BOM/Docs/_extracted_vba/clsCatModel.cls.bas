Attribute VB_Name = "clsCatModel"
Attribute VB_Base = "0{FCFB3D2A-A0FA-1068-A738-08002B3371B5}"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Attribute VB_TemplateDerived = False
Attribute VB_Customizable = False
'==================================================================================
' clsCatModel  -  Simple category model shared by the cost bars and the pie:
' n categories, each with a label, a value and a fill colour (packed ARGB).
' VBA forbids Public array fields in a class, so arrays sit behind indexed
' Property Get/Let.
'==================================================================================
Option Explicit

Public n As Long
Public widthPx As Single
Public heightPx As Single
Public Title As String

Private mLabels() As String
Private mValues() As Double
Private mColors() As Long

Private Sub Class_Initialize()
    widthPx = 1280
    heightPx = 720
End Sub

Public Sub SetSize(ByVal n_ As Long)
    n = n_
    If n_ < 1 Then n_ = 1
    ReDim mLabels(0 To n_ - 1)
    ReDim mValues(0 To n_ - 1)
    ReDim mColors(0 To n_ - 1)
End Sub

Public Property Get labels(ByVal i As Long) As String
    labels = mLabels(i)
End Property
Public Property Let labels(ByVal i As Long, ByVal v As String)
    mLabels(i) = v
End Property

Public Property Get values(ByVal i As Long) As Double
    values = mValues(i)
End Property
Public Property Let values(ByVal i As Long, ByVal v As Double)
    mValues(i) = v
End Property

Public Property Get Colors(ByVal i As Long) As Long
    Colors = mColors(i)
End Property
Public Property Let Colors(ByVal i As Long, ByVal v As Long)
    mColors(i) = v
End Property

Public Function total() As Double
    Dim i As Long
    For i = 0 To n - 1
        total = total + mValues(i)
    Next i
End Function
