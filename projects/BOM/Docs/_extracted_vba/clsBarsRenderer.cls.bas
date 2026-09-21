Attribute VB_Name = "clsBarsRenderer"
Attribute VB_Base = "0{FCFB3D2A-A0FA-1068-A738-08002B3371B5}"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Attribute VB_TemplateDerived = False
Attribute VB_Customizable = False
'==================================================================================
' clsBarsRenderer  -  Cost Analysis column chart (page 1, left): one column per
' category (L1 Macro System), sorted desc by the caller, value label above each bar,
' category label (word-wrapped onto up to 2 lines) below. Surface-agnostic; all
' geometry is a fraction of the canvas width.
'==================================================================================
Option Explicit

Public Sub Render(ByVal model As clsCatModel, ByVal surf As IChartSurface)
    Dim W As Single, H As Single
    W = model.widthPx: H = model.heightPx
    surf.BeginImage CLng(W), CLng(H)
    surf.FillRoundRect 0, 0, W, H, W * 0.008, argb(255, 255, 255, 255)

    Dim cText As Long, cBar As Long
    cText = HexToArgb("#404040")

    If model.n = 0 Then
        surf.DrawCenteredText "No data", W / 2, H / 2, W * 0.02, False, HexToArgb("#999999")
        Exit Sub
    End If

    ' plot rect: room above for value labels, below for 2-line category labels
    Dim mL As Single, mT As Single, mW As Single, mH As Single
    mL = W * 0.03: mT = H * 0.09
    mW = W - 2 * mL
    mH = H - mT - H * 0.17

    Dim vMax As Double, i As Long
    For i = 0 To model.n - 1
        If model.values(i) > vMax Then vMax = model.values(i)
    Next i
    If vMax <= 0 Then vMax = 1

    Dim slotW As Single, barW As Single, fVal As Single, fCat As Single
    slotW = mW / model.n
    barW = slotW * 0.52
    fVal = W * 0.0148
    fCat = W * 0.0132

    Dim x As Single, bh As Single, yTop As Single
    For i = 0 To model.n - 1
        surf.BeginGroup "bar"
        x = mL + i * slotW + (slotW - barW) / 2
        bh = mH * model.values(i) / vMax
        yTop = mT + mH - bh
        surf.FillRoundRect x, yTop, barW, bh, 0, model.Colors(i)
        surf.DrawCenteredText FmtSpace(model.values(i), 0), x + barW / 2, yTop - fVal * 1.1, fVal, False, cText
        DrawWrappedLabel surf, model.labels(i), x + barW / 2, mT + mH + fCat * 1.4, slotW * 0.96, fCat, cText
        surf.EndGroup
    Next i
End Sub

' Splits a label on spaces onto up to two centred lines that fit maxW.
Private Sub DrawWrappedLabel(ByVal surf As IChartSurface, ByVal text As String, _
        ByVal cx As Single, ByVal cy As Single, ByVal maxW As Single, _
        ByVal fpx As Single, ByVal col As Long)
    If surf.MeasureTextWidth(text, fpx, False) <= maxW Then
        surf.DrawCenteredText text, cx, cy, fpx, False, col
        Exit Sub
    End If
    ' find the split (nearest space to the middle) giving the most balanced lines
    Dim parts() As String, i As Long, best As Long, bestW As Single, l1 As String, l2 As String
    parts = Split(text, " ")
    If UBound(parts) < 1 Then
        surf.DrawCenteredText text, cx, cy, fpx, False, col
        Exit Sub
    End If
    bestW = 1E+30
    For i = 0 To UBound(parts) - 1
        Dim a As String, b As String, wA As Single, Wb As Single, mx As Single
        a = Join(SliceArr(parts, 0, i), " ")
        b = Join(SliceArr(parts, i + 1, UBound(parts)), " ")
        wA = surf.MeasureTextWidth(a, fpx, False)
        Wb = surf.MeasureTextWidth(b, fpx, False)
        mx = wA: If Wb > mx Then mx = Wb
        If mx < bestW Then bestW = mx: best = i
    Next i
    l1 = Join(SliceArr(parts, 0, best), " ")
    l2 = Join(SliceArr(parts, best + 1, UBound(parts)), " ")
    surf.DrawCenteredText l1, cx, cy - fpx * 0.62, fpx, False, col
    surf.DrawCenteredText l2, cx, cy + fpx * 0.62, fpx, False, col
End Sub

Private Function SliceArr(ByRef arr() As String, ByVal lo As Long, ByVal hi As Long) As String()
    Dim res() As String, i As Long
    ReDim res(0 To hi - lo)
    For i = lo To hi: res(i - lo) = arr(i): Next i
    SliceArr = res
End Function

