Attribute VB_Name = "clsWaterfallRenderer"
Attribute VB_Base = "0{FCFB3D2A-A0FA-1068-A738-08002B3371B5}"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Attribute VB_TemplateDerived = False
Attribute VB_Customizable = False
'==================================================================================
' clsWaterfallRenderer  -  Comparative Analysis chart (page 2), styled to match
' the Power BI Deneb "TPC Walk by Fifth" spec:
'   - stacked total bars split by 5th, segments in the CANONICAL split order
'     (Powertrain, Platform, Module, Top Hat, TC&Other - set by the builder);
'     each segment value is printed straight on the segment, font shrunk to fit
'     the (narrow, with 3 carlines) bar and coloured for contrast (white on dark
'     5th colours, dark slate on light ones)
'   - waterfall delta steps: INCREASE = red #FF0000, DECREASE = green #00A65A
'   - signed delta labels (+1 234), above a rising bar / below a falling one
'   - no connector lines between the delta columns (kept clean on purpose)
'   - category labels (car totals AND bridge steps) inclined 45 degrees
'     (ascending), word-wrapped onto a second line rather than truncated, so long
'     names stay fully readable
'   - navy (#263A8B) double-headed gap arrow + rounded pill ("+gap") between
'     consecutive TOTAL columns, in the empty band above the baseline
'==================================================================================
Option Explicit

Public Sub Render(ByVal model As clsWaterfallModel, ByVal surf As IChartSurface)
    Dim W As Single, H As Single
    W = model.widthPx: H = model.heightPx
    surf.BeginImage CLng(W), CLng(H)
    surf.FillRoundRect 0, 0, W, H, W * 0.006, argb(255, 255, 255, 255)

    Dim cText As Long, cUp As Long, cDown As Long, CarRow As Long
    cText = HexToArgb("#44546A")          ' Deneb textColor
    cUp = HexToArgb("#FF0000")            ' Deneb increaseColor (delta >= 0)
    cDown = HexToArgb("#00A65A")          ' Deneb decreaseColor (delta < 0)
    CarRow = HexToArgb("#263A8B")         ' Deneb arrowColor (gap pill)

    If model.CarCount < 2 Then
        surf.DrawCenteredText "Select at least 2 carlines", W / 2, H / 2, W * 0.015, False, HexToArgb("#999999")
        Exit Sub
    End If

    ' --- x slots: car totals + all bridge steps -------------------------------
    Dim nSlots As Long, c As Long, k As Long
    nSlots = model.CarCount
    For c = 1 To model.CarCount - 1
        nSlots = nSlots + model.StepCount(c)
    Next c

    ' top band = the legend (+ total value labels); bottom band = 45-deg labels.
    ' Left margin is WIDE (right is narrow) so the leftmost total's down-left angled
    ' label has room to sit anchored at its column without clipping or shifting.
    Dim mL As Single, mR As Single, mT As Single, mW As Single, mH As Single
    mL = W * 0.1: mR = W * 0.03: mT = H * 0.13
    mW = W - mL - mR
    mH = H - mT - H * 0.2

    ' longest label (measured along the inclined text) that still clears the legend
    ' generous budget so only VERY long labels (the car names) wrap to a 2nd line;
    ' moderate ones (step / level names) stay on a single inclined line
    Dim maxLbl As Single
    maxLbl = H * 0.34

    ' --- y scale: 0 .. max running level --------------------------------------
    Dim vMax As Double, run As Double
    For c = 1 To model.CarCount
        If model.CarTotal(c) > vMax Then vMax = model.CarTotal(c)
    Next c
    run = model.CarTotal(1)
    For c = 1 To model.CarCount - 1
        For k = 1 To model.StepCount(c)
            run = run + model.StepDelta(c, k)
            If run > vMax Then vMax = run
        Next k
    Next c
    If vMax <= 0 Then vMax = 1

    Dim slotW As Single, barW As Single, fVal As Single, fCat As Single, fSeg As Single
    slotW = mW / nSlots
    barW = slotW * 0.6
    fVal = W * 0.0108
    fCat = W * 0.01
    fSeg = W * 0.0098

    Dim slot As Long, x As Single, yBase As Single
    yBase = mT + mH
    slot = 0

    ' remember every total bar's x + top so the gap arrows can span them
    Dim totX() As Single, totTopY() As Single
    ReDim totX(1 To model.CarCount)
    ReDim totTopY(1 To model.CarCount)

    For c = 1 To model.CarCount
        ' ---- stacked total bar for car c ------------------------------------
        surf.BeginGroup "total"
        x = mL + slot * slotW + (slotW - barW) / 2
        Dim s As Long, segH As Single, yCur As Single
        Dim segTxt As String, segTw As Single, segF As Single
        yCur = yBase
        For s = 1 To model.SegCount
            segH = mH * model.SegValue(c, s) / vMax
            If segH > 0 Then
                yCur = yCur - segH
                surf.FillRoundRect x, yCur, barW, segH, 0, model.SegColor(s)
                ' Value printed straight on the segment (no pill). With 3 carlines the
                ' bars are narrow, so shrink the font to fit the bar width, and colour
                ' it for contrast on this segment (white on dark, dark on light) so it
                ' reads on the colour and on white where a wide number overhangs.
                segTxt = FmtSpace(model.SegValue(c, s), 0)
                segTw = surf.MeasureTextWidth(segTxt, fSeg, False)
                segF = fSeg
                If segTw > barW * 0.92 And segTw > 0 Then
                    segF = fSeg * (barW * 0.92) / segTw           ' shrink to fit width
                    If segF < fSeg * 0.62 Then segF = fSeg * 0.62 ' but keep it legible
                End If
                If segH > segF * 1.15 Then
                    surf.DrawCenteredText segTxt, x + barW / 2, yCur + segH / 2, _
                        segF, False, IdealTextColor(model.SegColor(s))
                End If
            End If
        Next s
        surf.DrawCenteredText FmtSpace(model.CarTotal(c), 0), x + barW / 2, yCur - fVal * 1.1, fVal, True, cText
        DrawAngledLabel surf, model.CarLabel(c), x + barW / 2, yBase, maxLbl, fCat, cText, True
        surf.EndGroup

        totX(c) = x
        totTopY(c) = yCur
        slot = slot + 1

        ' ---- bridge steps toward car c+1 ------------------------------------
        If c < model.CarCount Then
            run = model.CarTotal(c)
            For k = 1 To model.StepCount(c)
                surf.BeginGroup "step"
                Dim dv As Double, y1 As Single, y2 As Single, yTop As Single, bh As Single
                dv = model.StepDelta(c, k)
                x = mL + slot * slotW + (slotW - barW) / 2
                y1 = yBase - mH * run / vMax          ' level before
                run = run + dv
                y2 = yBase - mH * run / vMax          ' level after
                yTop = y1: If y2 < yTop Then yTop = y2
                bh = Abs(y2 - y1)
                If bh < H * 0.004 Then bh = H * 0.004     ' keep tiny gaps visible
                surf.FillRoundRect x, yTop, barW, bh, 0, IIf(dv >= 0, cUp, cDown)
                ' signed label: above a rising bar, below a falling one (Deneb)
                If dv >= 0 Then
                    surf.DrawCenteredText "+" & FmtSpace(dv, 0), x + barW / 2, yTop - fVal * 1.05, fVal, False, cText
                Else
                    surf.DrawCenteredText FmtSpace(dv, 0), x + barW / 2, yTop + bh + fVal * 1.05, fVal, False, cText
                End If
                DrawAngledLabel surf, model.StepLabel(c, k), x + barW / 2, yBase, maxLbl, fCat, cText, False
                surf.EndGroup
                slot = slot + 1
            Next k
        End If
    Next c

    ' ---- total-to-total gap arrows + pills (Deneb gapArrows marks) -----------
    ' Drawn in the empty band just above the baseline, one row per consecutive
    ' pair, stacked upward so pills at a shared total column never collide.
    Dim gap As Double, ay As Single, x1 As Single, x2 As Single, tri As Single
    tri = W * 0.005
    For c = 1 To model.CarCount - 1
        gap = model.CarTotal(c + 1) - model.CarTotal(c)
        ay = yBase - H * 0.055 - (c - 1) * H * 0.05
        x1 = totX(c) + barW + tri * 1.2                ' just right of total c
        x2 = totX(c + 1) - tri * 1.2                   ' just left of total c+1
        If x2 > x1 Then
            surf.BeginGroup "gapArrow"
            surf.StrokeLine x1, ay, x2, ay, CarRow, W * 0.0018, True
            ' outward triangle heads (left / right)
            surf.FillTriangle x1 - tri * 1.1, ay, x1 + tri, ay - tri, x1 + tri, ay + tri, CarRow
            surf.FillTriangle x2 + tri * 1.1, ay, x2 - tri, ay - tri, x2 - tri, ay + tri, CarRow
            ' rounded navy pill with the signed gap, centred on the arrow
            Dim gtxt As String, gtw As Single, pw As Single, ph As Single
            gtxt = IIf(gap >= 0, "+", "") & FmtSpace(gap, 0)
            gtw = surf.MeasureTextWidth(gtxt, fVal, True)
            pw = gtw + fVal * 1.6
            ph = fVal * 1.9
            surf.FillRoundRect (x1 + x2) / 2 - pw / 2, ay - ph / 2, pw, ph, ph * 0.28, CarRow
            surf.DrawCenteredText gtxt, (x1 + x2) / 2, ay, fVal, True, argb(255, 255, 255, 255)
            surf.EndGroup
        End If
    Next c

    ' ---- legend: split segments, centred across the top ----------------------
    surf.BeginGroup "legend"
    Dim fLeg As Single, sw As Single, pad As Single, lgap As Single, totW As Single, lx As Single, ly As Single, tw As Single
    fLeg = W * 0.0095
    sw = fLeg * 0.9: pad = fLeg * 0.4: lgap = fLeg * 1.5
    For s = 1 To model.SegCount
        totW = totW + sw + pad + surf.MeasureTextWidth(model.SegLabel(s), fLeg, False)
        If s < model.SegCount Then totW = totW + lgap
    Next s
    lx = W / 2 - totW / 2
    ly = H * 0.045
    For s = 1 To model.SegCount
        surf.FillRoundRect lx, ly - sw / 2, sw, sw, 0, model.SegColor(s)
        lx = lx + sw + pad
        tw = surf.MeasureTextWidth(model.SegLabel(s), fLeg, False)
        surf.DrawCenteredText model.SegLabel(s), lx + tw / 2, ly, fLeg, False, cText
        lx = lx + tw + lgap
    Next s
    surf.EndGroup
End Sub

' Category label under a bar, inclined 45 degrees (ascending: reads bottom-left ->
' top-right, with its far-right end anchored at the bar centre on the baseline).
' Long names are WORD-WRAPPED onto a second parallel line - never truncated - so
' the whole name stays readable. anchorX/anchorY = bar centre on the baseline;
' maxLen = width budget for one line before it wraps.
Private Sub DrawAngledLabel(ByVal surf As IChartSurface, ByVal text As String, _
        ByVal anchorX As Single, ByVal anchorY As Single, ByVal maxLen As Single, _
        ByVal fpx As Single, ByVal col As Long, ByVal bold As Boolean, _
        Optional ByVal mirror As Boolean = False)
    If Len(text) = 0 Then Exit Sub

    Const k As Single = 0.70710678       ' cos/sin(45)
    ' Default: ascending to the right (bulk down-left), anchoring the text's RIGHT
    ' end at the bar - same incline as every column. The leftmost label is kept
    ' on-canvas by the clamp below (not by mirroring). mirror is an available option
    ' (descending, bulk down-right) but currently unused.
    Dim DEG As Single, ux As Single, uy As Single, nx As Single, ny As Single, endSign As Single
    If mirror Then
        DEG = 45#: ux = k: uy = k: nx = -k: ny = k: endSign = 1#
    Else
        DEG = -45#: ux = k: uy = -k: nx = k: ny = k: endSign = -1#
    End If

    Dim lines() As String
    lines = WrapLines(surf, text, fpx, bold, maxLen)

    Dim lineH As Single, i As Long, halfW As Single
    Dim ex As Single, ey As Single, px As Single, py As Single, ccx As Single, ccy As Single
    lineH = fpx * 1.2
    ex = anchorX + ux * (fpx * 0.35)     ' anchored end of line 0, clear of the baseline
    ey = anchorY + uy * (fpx * 0.35) + fpx * 0.35

    ' keep the label on-canvas: if its far (left) end would fall past the left edge
    ' (mainly the leftmost total, which has no room down-left), nudge the whole label
    ' right by JUST the overflow so it stays close to its column instead of clipping
    Dim minLeft As Single, leftX As Single
    minLeft = 1000000000#
    For i = 0 To UBound(lines)
        halfW = surf.MeasureTextWidth(lines(i), fpx, bold) / 2#
        px = ex + nx * (i * lineH)
        If endSign < 0 Then leftX = px - ux * (2# * halfW) Else leftX = px
        If leftX < minLeft Then minLeft = leftX
    Next i
    If minLeft < fpx * 0.3 Then ex = ex + (fpx * 0.3 - minLeft)

    For i = 0 To UBound(lines)
        halfW = surf.MeasureTextWidth(lines(i), fpx, bold) / 2#
        px = ex + nx * (i * lineH)       ' anchored end of this line
        py = ey + ny * (i * lineH)
        ccx = px + endSign * ux * halfW  ' box centre = anchored end +/- u*halfWidth
        ccy = py + endSign * uy * halfW
        surf.DrawRotatedText lines(i), ccx, ccy, fpx, bold, col, DEG
    Next i
End Sub

' Splits text into 1 or 2 lines at the word boundary that best balances the two
' line widths, without ever truncating. A single word wider than maxLen is kept
' whole on one line.
Private Function WrapLines(ByVal surf As IChartSurface, ByVal text As String, _
        ByVal fpx As Single, ByVal bold As Boolean, ByVal maxLen As Single) As String()
    Dim one(0 To 0) As String
    If surf.MeasureTextWidth(text, fpx, bold) <= maxLen Then
        one(0) = text: WrapLines = one: Exit Function
    End If
    Dim parts() As String
    parts = Split(text, " ")
    If UBound(parts) < 1 Then
        one(0) = text: WrapLines = one: Exit Function    ' single long word: no wrap
    End If
    Dim i As Long, best As Long, bestW As Single, a As String, b As String
    Dim wA As Single, Wb As Single, mx As Single
    bestW = 1E+30
    For i = 0 To UBound(parts) - 1
        a = Join(SliceArr(parts, 0, i), " ")
        b = Join(SliceArr(parts, i + 1, UBound(parts)), " ")
        wA = surf.MeasureTextWidth(a, fpx, bold)
        Wb = surf.MeasureTextWidth(b, fpx, bold)
        mx = wA: If Wb > mx Then mx = Wb
        If mx < bestW Then bestW = mx: best = i
    Next i
    Dim two(0 To 1) As String
    two(0) = Join(SliceArr(parts, 0, best), " ")
    two(1) = Join(SliceArr(parts, best + 1, UBound(parts)), " ")
    WrapLines = two
End Function

Private Function SliceArr(ByRef arr() As String, ByVal lo As Long, ByVal hi As Long) As String()
    Dim res() As String, i As Long
    ReDim res(0 To hi - lo)
    For i = lo To hi: res(i - lo) = arr(i): Next i
    SliceArr = res
End Function

