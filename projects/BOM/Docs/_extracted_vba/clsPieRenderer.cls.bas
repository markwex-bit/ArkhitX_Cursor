Attribute VB_Name = "clsPieRenderer"
Attribute VB_Base = "0{FCFB3D2A-A0FA-1068-A738-08002B3371B5}"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Attribute VB_TemplateDerived = False
Attribute VB_Customizable = False
'==================================================================================
' clsPieRenderer  -  Cost Analysis pie (page 1, right): one wedge per split
' category (5th: Powertrain / Platform / Module / Top Hat / TC&Other), labelled
' "16 674; 31%" at the wedge mid-angle, with a legend row across the top.
' Angles are GDI+ style: 0 = east, clockwise positive; the pie starts at -90 (top).
'==================================================================================
Option Explicit

Public Sub Render(ByVal model As clsCatModel, ByVal surf As IChartSurface)
    Dim W As Single, H As Single
    W = model.widthPx: H = model.heightPx
    surf.BeginImage CLng(W), CLng(H)
    surf.FillRoundRect 0, 0, W, H, W * 0.008, argb(255, 255, 255, 255)

    Dim cText As Long
    cText = HexToArgb("#404040")

    Dim total As Double: total = model.total
    If model.n = 0 Or total <= 0 Then
        surf.DrawCenteredText "No data", W / 2, H / 2, W * 0.03, False, HexToArgb("#999999")
        Exit Sub
    End If

    Dim cx As Single, cy As Single, r As Single
    cx = W / 2
    cy = H * 0.55                         ' dropped to clear the legend now on top
    r = H * 0.32
    If W * 0.3 < r Then r = W * 0.3

    Dim fLbl As Single, fLeg As Single
    fLbl = W * 0.021
    fLeg = W * 0.02

    Dim i As Long, startDeg As Single, sweep As Single, midDeg As Single
    Dim outIdx As Long                    ' alternates the radius of OUTSIDE labels
    startDeg = -90
    For i = 0 To model.n - 1
        sweep = model.values(i) / total * 360
        surf.BeginGroup "slice"
        surf.FillWedge cx, cy, 0, r, startDeg, sweep, model.Colors(i), argb(255, 255, 255, 255), W * 0.002

        ' label "16 674; 31%" outside the wedge at its mid-angle (inside when the
        ' wedge is big enough to hold it); consecutive outside labels alternate
        ' between two radii so small adjacent slices never collide
        midDeg = startDeg + sweep / 2
        Dim txt As String, lr As Single, lx As Single, ly As Single
        txt = FmtSpace(model.values(i), 0) & "; " & FmtSpace(model.values(i) / total * 100#, 0) & "%"
        If sweep >= 40 Then
            lr = r * 0.62
        Else
            lr = r * IIf(outIdx Mod 2 = 0, 1.14, 1.34)
            outIdx = outIdx + 1
        End If
        lx = cx + lr * Cos(midDeg * PI / 180#)
        ly = cy + lr * Sin(midDeg * PI / 180#)
        Dim lcol As Long
        If sweep >= 40 Then lcol = argb(255, 255, 255, 255) Else lcol = cText
        surf.DrawCenteredText txt, lx, ly, fLbl, True, lcol
        surf.EndGroup
        startDeg = startDeg + sweep
    Next i

    ' legend row centred across the top: colour square + label per category
    surf.BeginGroup "legend"
    Dim sw As Single, pad As Single, gap As Single, totW As Single, x As Single, y As Single, tw As Single
    sw = fLeg * 0.85: pad = fLeg * 0.4: gap = fLeg * 1.4
    For i = 0 To model.n - 1
        totW = totW + sw + pad + surf.MeasureTextWidth(model.labels(i), fLeg, False)
        If i < model.n - 1 Then totW = totW + gap
    Next i
    x = cx - totW / 2
    y = H * 0.06
    For i = 0 To model.n - 1
        surf.FillRoundRect x, y - sw / 2, sw, sw, 0, model.Colors(i)
        x = x + sw + pad
        tw = surf.MeasureTextWidth(model.labels(i), fLeg, False)
        surf.DrawCenteredText model.labels(i), x + tw / 2, y, fLeg, False, cText
        x = x + tw + gap
    Next i
    surf.EndGroup
End Sub
