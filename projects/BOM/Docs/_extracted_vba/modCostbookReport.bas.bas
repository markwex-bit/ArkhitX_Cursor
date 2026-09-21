Attribute VB_Name = "modCostbookReport"
'==================================================================================
' modCostbookReport  -  the two report generators behind the form's export buttons.
'
'   ExtractFullReport - "Costbook Report" (page 1), one costbook, 4 sheets telling
'       the story top-down:
'       "Overview"                 who the carline is, the key figures, the TPC
'                                  structure charts (native vector shapes) and the
'                                  Top 10 cost drivers
'       "Full BOM"                 every costbook line, Pareto-ranked by TPC with
'                                  TPC % + cumulative % and the green 80/20 band
'       "Hierarchical View"        synthesis by normalized level (L1 Macro System /
'                                  L2 System / L3 Subsystem / Part Name)
'       "Hierarchical View by 5th" the same synthesis split by the 5th column
'
'   ExtractGapReport - "Gap Comparison Report" (page 2), 2..5 costbooks
'       (Baseline = first), 4 sheets:
'       "Comparison Overview"      one row per carline (attributes, TPC, gap vs
'                                  Baseline), the TPC-walk waterfall and Gap by 5th
'       "Full BOM Comparison"      the BOMs aligned line-by-line (common lines on
'                                  one row, others on their own row)
'       "Hierarchical Gaps"        all levels combined in one table, then each
'                                  normalized level on its own
'       "Hierarchical Gaps by 5th" the same, split by the 5th column
'       Gap tables are ordered as a TWO-SIDED Pareto: cost increases (red) biggest
'       first, then cost decreases (green); Cumulative Gap % runs within its side.
'
' All aggregation comes from modCostbookData and all charts from
' modCostbookCharts, so the reports always match the on-form previews.
' Branding: worksheet gridlines off, Segoe UI, navy titles + table headers, narrow
' separator columns. Reports open as NEW, UNSAVED workbooks the user saves at will.
'==================================================================================
Option Explicit

Private Const NAVY As Long = 6893343             ' RGB(31,47,105)  brand titles/headers
Private Const GRAYTXT As Long = 9868950          ' RGB(150,150,150) subtitles/notes
Private Const PARETO_FILL As Long = 5296274      ' RGB(146,208,80)  80/20 green band
Private Const HDR_GRAY As Long = 15132390        ' RGB(230,230,230) secondary headers
Private Const GAP_UP_FONT As Long = 255          ' RGB(255,0,0)   increase (Deneb walk)
Private Const GAP_DOWN_FONT As Long = 5940736    ' RGB(0,166,90)  decrease (Deneb walk)
Private Const GAP_UP_FILL As Long = 13551615     ' RGB(255,199,206) light red band
Private Const GAP_DOWN_FILL As Long = 13561798   ' RGB(198,239,206) light green band
Private Const PARETO_CUT As Double = 0.8

' Blank spacer row left between a chart's caption and the chart itself, in points.
' The caption is a normal cell; the chart is a floating shape pinned to the row
' BELOW this one, so nothing the renderer overhangs can reach back up to the text.
Private Const CHART_GAP_PT As Double = 6

' Overview: caption in row 17, spacer in row 18, charts pinned to row 19.
Private Const CHART_ANCHOR_ROW As Long = 19

' Compact "  [EUR]" tag for chart captions / titles (names the actual currency);
' "" only when the currency is unknown / mixed.
Private Function CurTag() As String
    Dim c As String: c = EffectiveCurrency()
    If Len(c) > 0 Then CurTag = "  [" & c & "]"
End Function

' The one base currency shared by every carline in a comparison, "" when mixed.
Private Function UniformSourceCurrency(ByVal carLabels As Collection) As String
    Dim i As Long, cur As String, c As String
    If carLabels Is Nothing Then Exit Function
    For i = 1 To carLabels.Count
        c = CarlineCurrency(CStr(carLabels(i)))
        If i = 1 Then
            cur = c
        ElseIf StrComp(cur, c, vbTextCompare) <> 0 Then
            Exit Function                         ' mixed source currencies -> ""
        End If
    Next i
    UniformSourceCurrency = cur
End Function

'=========================== shared branding helpers ===========================
' New workbook trimmed to one sheet.
Private Function NewReportWorkbook() As Workbook
    Dim Wb As Workbook
    Set Wb = Workbooks.Add
    ' DisplayAlerts must come back ON even if the delete loop throws: left off, it
    ' silently swallows every Excel prompt from then on, and it is one of the flags
    ' that shows up stuck in TpcState after a failed export.
    Application.DisplayAlerts = False
    On Error Resume Next
    Do While Wb.Worksheets.Count > 1
        Wb.Worksheets(Wb.Worksheets.Count).Delete
    Loop
    On Error GoTo 0
    Application.DisplayAlerts = True
    Set NewReportWorkbook = Wb
End Function

' Base look of every report sheet: Segoe UI, navy title in B1, gray subtitle in
' B2, a narrow spacer column A. Content starts at row 4.
Private Sub BrandSheet(ByVal ws As Worksheet, ByVal Title As String, ByVal subtitle As String, _
        Optional ByVal showCurrency As Boolean = True)
    ws.Cells.font.name = "Segoe UI"
    ws.Cells.font.Size = 9
    ' Title in B1, subtitle in B2 - left as plain cells (NOT merged): a merged band
    ' would make Excel skip AutoFit for every column it spans, so numbers under it
    ' show as "###". The long subtitle just overflows into the empty cells to its
    ' right; AutoFitData() below sizes columns to their data, ignoring these rows.
    With ws.Range("B1")
        .value = Title
        .font.bold = True
        .font.Size = 14
        .font.color = NAVY
    End With
    With ws.Range("B2")
        .value = subtitle
        .font.Italic = True
        .font.Size = 9
        .font.color = GRAYTXT
    End With
    ws.Columns("A").ColumnWidth = 1.5
    If showCurrency Then AddCurrencyBadge ws
End Sub

' Prominent currency "chip" pinned at the top of every report sheet (row 3, just
' under the title/subtitle) so the reader can't miss which currency the TPC figures
' are in. Drawn as a native rounded shape - floats above the grid, so it survives
' the later column AutoFit and needs no merged cells. Green = the brand "money"
' accent. Reads the effective currency (conversion target, else the source-currency
' context the report set before writing its sheets).
Private Sub AddCurrencyBadge(ByVal ws As Worksheet)
    On Error Resume Next
    Dim d As String: d = DisplayCurrency()
    Dim eff As String: eff = EffectiveCurrency()
    Dim txt As String
    If Len(d) > 0 Then
        txt = "TPC CURRENCY:   " & d & "   (converted)"
    ElseIf Len(eff) > 0 Then
        txt = "TPC CURRENCY:   " & eff
    Else
        txt = "TPC CURRENCY:   mixed - each costbook in its own source currency"
    End If

    ws.rows(3).RowHeight = 22                         ' clearance for the chip
    Dim shp As Shape
    Set shp = ws.Shapes.AddShape(msoShapeRoundedRectangle, _
              ws.Range("B3").Left, ws.Range("B3").top + 1, 180, 18)
    shp.name = "CurrencyBadge"
    shp.Fill.ForeColor.RGB = RGB(46, 155, 71)         ' brand green (money)
    shp.Line.Visible = msoFalse
    shp.Shadow.Visible = msoFalse
    With shp.TextFrame2
        .WordWrap = msoFalse
        .MarginLeft = 8: .MarginRight = 8: .MarginTop = 1: .MarginBottom = 1
        .VerticalAnchor = msoAnchorMiddle
        With .TextRange
            .text = txt
            .font.bold = msoTrue
            .font.Size = 10.5
            .font.name = "Segoe UI"
            .font.Fill.ForeColor.RGB = vbWhite
        End With
        .AutoSize = msoAutoSizeShapeToFitText         ' snug fit around the text
    End With
    On Error GoTo 0
End Sub

' Navy header band for a table header row.
Private Sub StyleHeader(ByVal rng As Range)
    With rng
        .font.bold = True
        .font.color = vbWhite
        .Interior.color = NAVY
    End With
End Sub

' Borderless table: ListObject for sorting/filtering, no built-in style lines.
Private Function AddLeanTable(ByVal ws As Worksheet, ByVal rng As Range, _
        ByVal tableName As String) As ListObject
    Dim lo As ListObject
    Set lo = ws.ListObjects.Add(xlSrcRange, rng, , xlYes)
    lo.name = tableName
    lo.TableStyle = ""                       ' lean: no border grid, headers styled by us
    StyleHeader lo.HeaderRowRange
    Set AddLeanTable = lo
End Function

' Final pass over a finished report workbook: hide gridlines everywhere and
' land the reader on the first (overview) sheet.
Private Sub FinishReport(ByVal Wb As Workbook)
    Dim ws As Worksheet
    On Error Resume Next
    For Each ws In Wb.Worksheets
        ws.Activate
        ActiveWindow.DisplayGridlines = False
    Next ws
    Wb.Worksheets(1).Activate
    On Error GoTo 0
End Sub

' Last 1-based row whose cumulative % (in cumCol) is still under the 80% cut.
Private Function ParetoLastRow(ByRef arr As Variant, ByVal cumCol As Long, _
                               ByVal n As Long) As Long
    Dim i As Long
    For i = 1 To n
        If IsNumeric(arr(i, cumCol)) Then
            If CDbl(arr(i, cumCol)) < PARETO_CUT Then ParetoLastRow = i Else Exit For
        End If
    Next i
End Function

'=============================== Costbook Report ===============================
Public Function ExtractFullReport(ByVal veh As String, ByVal ms As String, _
                                  ByVal dateKey As String) As Workbook
    Dim rows As Variant
    rows = GetCostbookRows(veh, ms, dateKey)
    If Not IsArray(rows) Then
        MsgBox "No costbook rows found for:" & vbCrLf & veh & " | " & ms & " | " & dateKey, _
               vbExclamation, "Export Costbook Report"
        Exit Function
    End If

    ' name this costbook's base currency wherever values aren't converted
    SetSourceCurrencyContext CarlineCurrency(veh)

    Dim Wb As Workbook
    Set Wb = NewReportWorkbook()

    WriteCostbookOverview Wb.Worksheets(1), rows, veh, ms, dateKey
    WriteFullBOM Wb.Worksheets.Add(After:=Wb.Worksheets(Wb.Worksheets.Count)), rows, veh
    WriteHierarchical Wb.Worksheets.Add(After:=Wb.Worksheets(Wb.Worksheets.Count)), rows
    WriteHierarchicalBy5th Wb.Worksheets.Add(After:=Wb.Worksheets(Wb.Worksheets.Count)), rows

    ClearSourceCurrencyContext
    FinishReport Wb
    Set ExtractFullReport = Wb
End Function

'---------------------------------- Overview -----------------------------------
' Page 1 of the story: identity of the carline, the headline figures, the two
' structure charts (exported as native, editable vector shapes) and the Top 10
' cost drivers - everything the reader needs before diving into the BOM.
Private Sub WriteCostbookOverview(ByVal ws As Worksheet, ByRef rows As Variant, _
        ByVal veh As String, ByVal ms As String, ByVal dateKey As String)
    ws.name = "Overview"
    BrandSheet ws, "Costbook Report - " & veh, ms & "  |  " & dateKey

    Dim i As Long, r As Long

    '---- carline card: the full CarlinesDefinition record, in two columns ------
    ws.Range("B4").value = "Carline (from CarlinesDefinition)"
    ws.Range("B4").font.bold = True
    ws.Range("B4").font.color = NAVY
    Dim fn As Variant, fv As Variant, nf As Long, half As Long
    Dim capCol As Long, valCol As Long, rr As Long
    fn = CarlineFieldNames()
    fv = CarlineFieldValues(veh)
    nf = UBound(fn) - LBound(fn) + 1
    half = (nf + 1) \ 2
    For i = 0 To nf - 1
        If i < half Then
            capCol = 2: valCol = 3: rr = 5 + i
        Else
            capCol = 5: valCol = 6: rr = 5 + (i - half)
        End If
        ws.Cells(rr, capCol).value = CStr(fn(LBound(fn) + i))
        ws.Cells(rr, capCol).font.color = GRAYTXT
        ws.Cells(rr, valCol).value = fv(LBound(fv) + i)
        ws.Cells(rr, valCol).font.bold = True
    Next i

    '---- key figures ----------------------------------------------------------
    Dim total As Double: total = TotalTPC(rows)
    Dim l1 As Variant: l1 = ParetoAgg(rows, CB_L1)
    ws.Range("H4").value = "Key figures"
    ws.Range("H4").font.bold = True
    ws.Range("H4").font.color = NAVY
    ws.Range("H5").value = "Total " & TpcHeader()
    ws.Range("H5").font.color = GRAYTXT
    With ws.Range("I5")
        .value = total
        .NumberFormat = "#,##0"
        .font.bold = True
        .font.Size = 12
        .font.color = NAVY
    End With
    ws.Range("H6").value = "BOM lines"
    ws.Range("H6").font.color = GRAYTXT
    ws.Range("I6").value = UBound(rows, 1)
    ws.Range("I6").font.bold = True
    If IsArray(l1) Then
        ws.Range("H7").value = "Top L1 Macro System"
        ws.Range("H7").font.color = GRAYTXT
        ws.Range("I7").value = CStr(l1(1, 1))
        ws.Range("I7").font.bold = True
        ws.Range("H8").value = "Its TPC share"
        ws.Range("H8").font.color = GRAYTXT
        ws.Range("I8").value = CDbl(l1(1, 3))
        ws.Range("I8").NumberFormat = "0.0%"
        ws.Range("I8").font.bold = True
    End If
    ws.Range("H10").value = CurrencyNote()
    ws.Range("H10").font.color = GRAYTXT
    ws.Range("H10").font.Italic = True

    '---- reading guide --------------------------------------------------------
    ws.Range("K4").value = "In this report"
    ws.Range("K4").font.bold = True
    ws.Range("K4").font.color = NAVY
    Dim guide As Variant
    guide = Array("1. Overview - key figures and the TPC structure at a glance", _
                  "2. Full BOM - every line, Pareto-ranked by TPC (green = first 80%)", _
                  "3. Hierarchical View - synthesis by normalized level (L1 / L2 / L3 / Part)", _
                  "4. Hierarchical View by 5th - the same synthesis split by the 5th column")
    For i = 0 To UBound(guide)
        ws.Cells(5 + i, 11).value = guide(i)
        ws.Cells(5 + i, 11).font.color = GRAYTXT
    Next i

    '---- charts zone: caption row 17, spacer row 18, charts anchored on row 19 -
    ' The caption is written here (not after the Top 10 block) so the spacer row's
    ' height is set before any row Top is read below.
    With ws.Range("B17")
        .value = "TPC structure - by L1 Macro System (left) and by 5th split (right)" & CurTag()
        .font.bold = True
        .font.color = NAVY
    End With
    ws.rows(CHART_ANCHOR_ROW - 1).RowHeight = CHART_GAP_PT

    '---- Top 10 cost drivers (below the charts zone) --------------------------
    ' first row clear of the charts (bars: 620pt wide -> ~310pt tall, + margin)
    r = CHART_ANCHOR_ROW + 1
    Do While ws.rows(r).top < ws.rows(CHART_ANCHOR_ROW).top + 330
        r = r + 1
    Loop
    WriteParetoBlock ws, r, 2, "Top 10 Systems (L2)", "L2 System", _
                     TopN(ParetoAgg(rows, CB_L2), 10), "OvTopSystems"
    WriteParetoBlock ws, r, 7, "Top 10 Parts (normalized)", "Normalized Part Name (EN)", _
                     TopN(ParetoAgg(rows, CB_NORMPART), 10), "OvTopParts"

    ' range-scoped autofit (BEFORE the charts land, since shapes ride on the grid),
    ' then clamp so a long value (emails, names) can't stretch the sheet
    ws.Range(ws.Cells(4, 2), ws.Cells(16, 6)).Columns.AutoFit
    ws.Range(ws.Cells(4, 8), ws.Cells(10, 9)).Columns.AutoFit
    ws.Range(ws.Cells(r, 2), ws.Cells(r + 12, 5)).Columns.AutoFit
    ws.Range(ws.Cells(r, 7), ws.Cells(r + 12, 10)).Columns.AutoFit
    CapWidths ws, 2, 11, 40

    '---- charts, exported as native, editable vector shape groups -------------
    ' Built at the anchor row, then PINNED there: a group's own Top is its topmost
    ' child's, so without the pin an overhanging value label lifts the whole group
    ' up over the caption in row 17.
    Dim x As Single, y As Single
    x = ws.Cells(CHART_ANCHOR_ROW, 2).Left: y = ws.Cells(CHART_ANCHOR_ROW, 2).top
    PlaceGroupAt BuildCostBarsGroup(ws, x, y, 620, rows), x, y          ' 620pt -> ~310pt tall
    PlaceGroupAt BuildCostPieGroup(ws, x + 640, y, 400, rows), x + 640, y   ' beside the bars
End Sub

'---------------------------------- Full BOM -----------------------------------
Private Sub WriteFullBOM(ByVal ws As Worksheet, ByRef rows As Variant, ByVal veh As String)
    ws.name = "Full BOM"
    BrandSheet ws, "Full BOM - " & veh, _
               "Every costbook line, sorted by TPC (descending). Green band = lines building the first 80% of total TPC (80/20 rule).  " & CurrencyNote()

    Dim hdr As Variant
    hdr = Array("Data Source", "Vehicle Code", "Milestone", "Milestone Date", "VSC", _
                "Poro", "PoRo Name", "Macro System", "Subsystem", "VSC Description", _
                "Module Code", "Part Description", "Part Number", "LOT", "CPSA", _
                "Module Code Description", "Qty", "5th", TpcHeader(), "TPC %", _
                "TPC Cumulative %", "Normalized Part Name (EN)", "L1 Macro System", _
                "L2 System", "L3 Subsystem", "Classification Method", "Confidence")

    Dim n As Long: n = UBound(rows, 1)
    Dim total As Double: total = TotalTPC(rows)

    ' body: CB columns with TPC % + cumulative % inserted after TPC
    Dim out() As Variant, i As Long, j As Long, cum As Double, tpc As Double
    ReDim out(1 To n, 1 To 27)
    For i = 1 To n
        For j = 1 To 19: out(i, j) = rows(i, j): Next j
        tpc = RowTPC(rows(i, CB_TPC))
        If total <> 0 Then out(i, 20) = tpc / total Else out(i, 20) = 0
        cum = cum + out(i, 20)
        out(i, 21) = cum
        For j = 22 To 27: out(i, j) = rows(i, j - 2): Next j
    Next i

    With ws
        With .Range("T1")
            .value = " First 80% of TPC"
            .Interior.color = PARETO_FILL
            .font.bold = True
        End With
        .Range("W1").value = "AI-normalized classification"
        .Range("W1").font.Italic = True
        .Range("W1").font.color = GRAYTXT
        .Range("S2").value = "Total TPC"
        .Range("T2").value = total
        .Range("S3").value = "Visible subtotal"
        .Range("S2:S3").font.bold = True
        .Range("T2:T3").NumberFormat = "#,##0.00"

        .Range("B4").Resize(1, 27).value = hdr
        .Range("B5").Resize(n, 27).value = out
        .Range("T5").Resize(n, 1).NumberFormat = "#,##0.00"
        .Range("U5").Resize(n, 2).NumberFormat = "0.0%"
        .Range("R5").Resize(n, 1).NumberFormat = "0"          ' Qty

        ' 80/20 Pareto band on TPC / TPC % / Cumulative %
        Dim lastGreen As Long
        lastGreen = ParetoLastRow(out, 21, n)
        If lastGreen > 0 Then .Range("T5:V" & (4 + lastGreen)).Interior.color = PARETO_FILL

        AddLeanTable ws, .Range("B4").Resize(n + 1, 27), "FullBOM"

        ' live subtotal that follows table filtering
        .Range("T3").Formula = "=SUBTOTAL(109,FullBOM[" & TpcHeader() & "])"

    End With
    AutoFitData ws, 2, 28
    ws.Columns("B").ColumnWidth = 30
    ws.Columns("C").ColumnWidth = 26
End Sub

'------------------------------ Hierarchical View ------------------------------
Private Sub WriteHierarchical(ByVal ws As Worksheet, ByRef rows As Variant)
    ws.name = "Hierarchical View"
    BrandSheet ws, "Hierarchical View", _
               "TPC synthesis by normalized level, biggest first. Green band = first 80% of TPC.  " & CurrencyNote()

    Dim levels As Variant, titles As Variant, tblNames As Variant
    levels = Array(CB_L1, CB_L2, CB_L3, CB_NORMPART)
    titles = Array("L1 Macro System", "L2 System", "L3 Subsystem", "Normalized Part Name (EN)")
    tblNames = Array("SynthL1Domain", "SynthL2System", "SynthL3Subsystem", "SynthPartName")

    Dim b As Long, startCol As Long, agg As Variant
    For b = 0 To 3
        startCol = 2 + b * 5                          ' B, G, L, Q
        agg = ParetoAgg(rows, CLng(levels(b)))
        WriteParetoBlock ws, 4, startCol, "Level " & (b + 1) & " - " & CStr(titles(b)), _
                         CStr(titles(b)), agg, CStr(tblNames(b))
    Next b
    AutoFitData ws, 2, 21
    ws.Columns("F").ColumnWidth = 2                   ' lean separators
    ws.Columns("K").ColumnWidth = 2
    ws.Columns("P").ColumnWidth = 2
End Sub

' Writes one synthesis block as a lean Excel table (ListObject): bold navy level
' title, navy header, data rows with the green Pareto band. No grand-total row.
Private Sub WriteParetoBlock(ByVal ws As Worksheet, ByVal topRow As Long, _
        ByVal startCol As Long, ByVal levelTitle As String, ByVal nameHeader As String, _
        ByRef agg As Variant, ByVal tableName As String)

    With ws.Cells(topRow, startCol)
        .value = levelTitle
        .font.bold = True
        .font.color = NAVY
    End With
    ws.Cells(topRow + 1, startCol).value = nameHeader
    ws.Cells(topRow + 1, startCol + 1).value = TpcHeader()
    ws.Cells(topRow + 1, startCol + 2).value = "TPC %"
    ws.Cells(topRow + 1, startCol + 3).value = "Cumulative %"

    If Not IsArray(agg) Then Exit Sub
    Dim n As Long: n = UBound(agg, 1)

    ws.Cells(topRow + 2, startCol).Resize(n, 4).value = agg
    ws.Cells(topRow + 2, startCol + 1).Resize(n, 1).NumberFormat = "#,##0"
    ws.Cells(topRow + 2, startCol + 2).Resize(n, 2).NumberFormat = "0%"

    AddLeanTable ws, ws.Cells(topRow + 1, startCol).Resize(n + 1, 4), tableName

    Dim lastGreen As Long
    lastGreen = ParetoLastRow(agg, 4, n)
    If lastGreen > 0 Then _
        ws.Cells(topRow + 2, startCol).Resize(lastGreen, 4).Interior.color = PARETO_FILL
End Sub

'-------------------------- Hierarchical View by 5th ----------------------------
Private Sub WriteHierarchicalBy5th(ByVal ws As Worksheet, ByRef rows As Variant)
    ws.name = "Hierarchical View by 5th"
    BrandSheet ws, "Hierarchical View by 5th", _
               "TPC synthesis by normalized level within each 5th split. Green band = first 80% of TPC within its 5th.  " & CurrencyNote()

    Dim levels As Variant, titles As Variant, tblNames As Variant
    levels = Array(CB_L1, CB_L2, CB_L3, CB_NORMPART)
    titles = Array("L1 Macro System", "L2 System", "L3 Subsystem", "Normalized Part Name (EN)")
    tblNames = Array("Synth5thL1Domain", "Synth5thL2System", "Synth5thL3Subsystem", "Synth5thPartName")

    ' 5th groups ordered by group TPC desc
    Dim fifths As Variant
    fifths = ParetoAgg(rows, CB_FIFTH)
    If Not IsArray(fifths) Then Exit Sub

    Dim b As Long, startCol As Long
    For b = 0 To 3
        startCol = 2 + b * 6                          ' B, H, N, T
        With ws.Cells(4, startCol)
            .value = "Level " & (b + 1) & " - " & CStr(titles(b))
            .font.bold = True
            .font.color = NAVY
        End With
        ws.Cells(5, startCol).value = "5th"
        ws.Cells(5, startCol + 1).value = CStr(titles(b))
        ws.Cells(5, startCol + 2).value = TpcHeader()
        ws.Cells(5, startCol + 3).value = "TPC %"
        ws.Cells(5, startCol + 4).value = "Cumulative %"

        Dim r As Long: r = 6
        Dim f As Long
        For f = 1 To UBound(fifths, 1)
            Dim fifthName As String, sub_ As Variant
            fifthName = CStr(fifths(f, 1))
            sub_ = ParetoAgg(FilterRowsBy(rows, CB_FIFTH, fifthName), CLng(levels(b)))
            If IsArray(sub_) Then
                Dim n As Long, i As Long
                n = UBound(sub_, 1)
                Dim out() As Variant
                ReDim out(1 To n, 1 To 5)
                For i = 1 To n
                    out(i, 1) = fifthName
                    out(i, 2) = sub_(i, 1)
                    out(i, 3) = sub_(i, 2)
                    out(i, 4) = sub_(i, 3)
                    out(i, 5) = sub_(i, 4)
                Next i
                ws.Cells(r, startCol).Resize(n, 5).value = out
                ws.Cells(r, startCol + 2).Resize(n, 1).NumberFormat = "#,##0"
                ws.Cells(r, startCol + 3).Resize(n, 2).NumberFormat = "0%"
                Dim lastGreen As Long
                lastGreen = ParetoLastRow(sub_, 4, n)
                If lastGreen > 0 Then _
                    ws.Cells(r, startCol).Resize(lastGreen, 5).Interior.color = PARETO_FILL
                r = r + n
            End If
        Next f

        ' whole block -> one lean table (header row 5, data rows 6..r-1)
        If r > 6 Then _
            AddLeanTable ws, ws.Cells(5, startCol).Resize(r - 5, 5), CStr(tblNames(b))
    Next b
    AutoFitData ws, 2, 25
    ws.Columns("G").ColumnWidth = 2                   ' lean separators
    ws.Columns("M").ColumnWidth = 2
    ws.Columns("S").ColumnWidth = 2
End Sub

'============================ Gap Comparison Report ============================
' carlineRows / carLabels / carInfo: Collections aligned by index, Baseline
' first (2..5 items). carlineRows are ALREADY filtered by the caller when a
' Split (5th) value is selected; carInfo items are 1D arrays of the CI_ index
' fields (attributes for the Comparison Overview).
' levelName = the page-2 "Analysis Level" in effect (drives the waterfall steps in
' the Comparison Overview, so the exported graph matches the on-form active view).
Public Function ExtractGapReport(ByVal carlineRows As Collection, _
        ByVal carLabels As Collection, ByVal carInfo As Collection, _
        ByVal splitFilter As String, ByVal levelName As String) As Workbook
    If carlineRows Is Nothing Then Exit Function
    If carlineRows.Count < 2 Then
        MsgBox "Select at least two costbooks first.", vbExclamation, "Export Gap Comparison Report"
        Exit Function
    End If

    Dim nc As Long: nc = carlineRows.Count
    Dim legend As String, c As Long
    legend = "Baseline: " & carLabels(1)
    For c = 2 To nc
        legend = legend & "    Vehicle " & c & ": " & carLabels(c)
    Next c
    If Len(splitFilter) > 0 And splitFilter <> FILTER_ALL Then _
        legend = legend & "    [restricted to 5th = " & splitFilter & "]"

    ' when not converting, name the shared source currency (blank when carlines mix
    ' currencies - the notes then say "each in its own", flagging a conversion is due)
    SetSourceCurrencyContext UniformSourceCurrency(carLabels)

    Dim Wb As Workbook
    Set Wb = NewReportWorkbook()

    WriteComparisonOverview Wb.Worksheets(1), carlineRows, carLabels, carInfo, legend, levelName
    WriteBomComparison Wb.Worksheets.Add(After:=Wb.Worksheets(Wb.Worksheets.Count)), _
                       carlineRows, legend
    WriteHierarchicalGaps Wb.Worksheets.Add(After:=Wb.Worksheets(Wb.Worksheets.Count)), _
                          carlineRows, legend, False
    WriteHierarchicalGaps Wb.Worksheets.Add(After:=Wb.Worksheets(Wb.Worksheets.Count)), _
                          carlineRows, legend, True

    ClearSourceCurrencyContext
    FinishReport Wb
    Set ExtractGapReport = Wb
End Function

'--------------------------- Comparison Overview -------------------------------
Private Sub WriteComparisonOverview(ByVal ws As Worksheet, ByVal carlineRows As Collection, _
        ByVal carLabels As Collection, ByVal carInfo As Collection, ByVal legend As String, _
        ByVal levelName As String)
    ws.name = "Comparison Overview"
    ' active-view level for the waterfall steps ("(All)"/blank -> Macro System)
    Dim lvl As String: lvl = levelName
    If Len(Trim$(lvl)) = 0 Or lvl = FILTER_ALL Then lvl = "L1 Macro System"
    BrandSheet ws, "Gap Comparison Report", legend & _
               "    -    increases in red, decreases in green    -    " & CurrencyNote()

    Dim nc As Long: nc = carlineRows.Count
    Dim c As Long, j As Long

    '---- one row per carline --------------------------------------------------
    Dim hdr As Variant
    hdr = Array("Role", "Vehicle", "Milestone", "Milestone Date", "Powertrain", _
                "Platform", "Segment", "Vehicle Type", TpcHeader(), "SOP Date", _
                "Gap vs Baseline", "Gap %")
    ws.Range("B4").Resize(1, 12).value = hdr

    Dim baseTpc As Double, tpc As Double, att As Variant
    Dim out() As Variant
    ReDim out(1 To nc, 1 To 12)
    For c = 1 To nc
        att = carInfo(c)
        tpc = TotalTPC(carlineRows(c))
        If c = 1 Then baseTpc = tpc
        out(c, 1) = IIf(c = 1, "Baseline", "Vehicle " & c)
        out(c, 2) = att(CI_VEHICLE)
        out(c, 3) = att(CI_MILESTONE)
        out(c, 4) = att(CI_DATEKEY)
        out(c, 5) = att(CI_PTRAIN)
        out(c, 6) = att(CI_PLATFORM)
        out(c, 7) = att(CI_SEGMENT)
        out(c, 8) = att(CI_TYPE)
        out(c, 9) = tpc
        out(c, 10) = att(CI_SOP)
        If c = 1 Then
            out(c, 11) = "-": out(c, 12) = "-"
        Else
            out(c, 11) = tpc - baseTpc
            If baseTpc <> 0 Then out(c, 12) = (tpc - baseTpc) / baseTpc Else out(c, 12) = "-"
        End If
    Next c
    ws.Range("B5").Resize(nc, 12).value = out
    ws.Range("J5").Resize(nc, 1).NumberFormat = "#,##0"
    ws.Range("L5").Resize(nc, 1).NumberFormat = "#,##0"
    ws.Range("M5").Resize(nc, 1).NumberFormat = "0.0%"
    AddLeanTable ws, ws.Range("B4").Resize(nc + 1, 12), "ComparisonOverview"
    For c = 2 To nc
        If IsNumeric(out(c, 11)) Then
            ws.Cells(4 + c, 12).Resize(1, 2).font.color = _
                IIf(CDbl(out(c, 11)) > 0, GAP_UP_FONT, GAP_DOWN_FONT)
            ws.Cells(4 + c, 12).Resize(1, 2).font.bold = True
        End If
    Next c

    '---- carline details (transposed: field per row, one column per vehicle) --
    Dim dr As Long: dr = (4 + nc) + 2
    With ws.Cells(dr, 2)
        .value = "Carline details (from CarlinesDefinition)"
        .font.bold = True
        .font.color = NAVY
    End With
    Dim fn As Variant: fn = CarlineFieldNames()
    Dim nf As Long: nf = UBound(fn) - LBound(fn) + 1
    Dim titlesArr() As String, valsByCar() As Variant, cc As Long
    ReDim titlesArr(1 To nc)
    ReDim valsByCar(1 To nc)
    ws.Cells(dr + 1, 2).value = "Field"
    For cc = 1 To nc
        att = carInfo(cc)
        titlesArr(cc) = CStr(att(CI_VEHICLE))
        valsByCar(cc) = CarlineFieldValues(titlesArr(cc))
        ws.Cells(dr + 1, 2 + cc).value = _
            IIf(cc = 1, "Baseline: ", "Vehicle " & cc & ": ") & titlesArr(cc)
    Next cc
    Dim ff As Long, vArr As Variant
    For ff = 0 To nf - 1
        ws.Cells(dr + 2 + ff, 2).value = CStr(fn(LBound(fn) + ff))
        For cc = 1 To nc
            vArr = valsByCar(cc)
            ws.Cells(dr + 2 + ff, 2 + cc).value = vArr(LBound(vArr) + ff)
        Next cc
    Next ff
    AddLeanTable ws, ws.Cells(dr + 1, 2).Resize(nf + 1, 1 + nc), "CarlineDetails"
    Dim detailsBottom As Long: detailsBottom = dr + 1 + nf

    '---- TPC walk caption + Gap by 5th ----------------------------------------
    Dim r As Long: r = detailsBottom + 2
    With ws.Cells(r, 2)
        .value = "TPC Walk - Baseline to Vehicle " & nc & " (steps by " & lvl & ", totals split by 5th)" & CurTag()
        .font.bold = True
        .font.color = NAVY
    End With

    ' spacer row under the caption, then the waterfall's anchor row
    ws.rows(r + 1).RowHeight = CHART_GAP_PT
    Dim wfTop As Long: wfTop = r + 2

    ' first row clear of the waterfall (760pt wide -> ~315pt tall, + margin)
    r = wfTop + 1
    Do While ws.rows(r).top < ws.rows(wfTop).top + 335
        r = r + 1
    Loop
    WriteGapBlock ws, r, "Gap by 5th", GapReportAgg(carlineRows, Array(CB_FIFTH)), _
                  Array("5th"), nc, "GapBy5th", 0

    ' autofit BEFORE the shape lands (shapes ride on the cell grid), then clamp so
    ' a long carline-detail value (emails, names) can't stretch the sheet
    Dim lc As Long: lc = 1 + GapReportCols(1, nc)
    If lc < 13 Then lc = 13                        ' at least the summary table (B:M)
    If lc < 2 + nc Then lc = 2 + nc                ' at least the transposed table
    AutoFitData ws, 2, lc
    CapWidths ws, 2, 2 + nc, 42

    '---- TPC walk, exported as a native, editable vector waterfall ------------
    ' Pinned to the anchor row after grouping - see PlaceGroupAt: a group inherits
    ' its topmost child's Top, so a step label drawn above the plot would otherwise
    ' carry the whole waterfall up over the caption.
    Dim wfX As Single, wfY As Single
    wfX = ws.Cells(wfTop, 2).Left: wfY = ws.Cells(wfTop, 2).top
    PlaceGroupAt BuildWaterfallGroup(ws, wfX, wfY, 760, carlineRows, carLabels, lvl), wfX, wfY
End Sub

'--------------------------- Full BOM Comparison --------------------------------
Private Sub WriteBomComparison(ByVal ws As Worksheet, ByVal carlineRows As Collection, _
        ByVal legend As String)
    ws.name = "Full BOM Comparison"
    BrandSheet ws, "Full BOM Comparison", legend & _
               "    -    lines matched by Part Number (by description when blank); unmatched lines keep their own row    -    " & CurrencyNote()

    Dim nc As Long: nc = carlineRows.Count
    Dim ctxHdr As Variant: ctxHdr = BomComparisonCtxHeaders()
    Dim k As Long: k = UBound(ctxHdr) - LBound(ctxHdr) + 1
    WriteGapBlock ws, 4, "All BOM lines - two-sided Pareto (increases first, then decreases)", _
                  AlignedBomGap(carlineRows), ctxHdr, nc, "BomComparison", 0

    ' autofit the whole table, then clamp the long free-text columns so the many
    ' descriptive columns don't blow the sheet out horizontally
    Dim lastCol As Long: lastCol = 1 + GapReportCols(k, nc)
    AutoFitData ws, 2, lastCol
    CapWidths ws, 2, lastCol, 42
End Sub

' Clamp every column in [c1..c2] to at most maxW (after AutoFit) so long free-text
' columns (descriptions, part names) don't stretch the sheet out horizontally.
Private Sub CapWidths(ByVal ws As Worksheet, ByVal c1 As Long, ByVal c2 As Long, _
                      ByVal maxW As Double)
    Dim c As Long
    For c = c1 To c2
        If ws.Columns(c).ColumnWidth > maxW Then ws.Columns(c).ColumnWidth = maxW
    Next c
End Sub

' AutoFit columns c1..c2 to their DATA. The long title/subtitle in B1:B2 is cleared
' first so it can't stretch column B, then restored (it overflows into the empty
' cells to its right). No cell merging is used - a merged title band makes Excel
' skip AutoFit for the columns it spans, so numbers under it would show as "###".
Private Sub AutoFitData(ByVal ws As Worksheet, ByVal c1 As Long, ByVal c2 As Long)
    Dim t1 As Variant, t2 As Variant
    t1 = ws.Range("B1").value: t2 = ws.Range("B2").value
    ws.Range("B1:B2").ClearContents
    ws.Range(ws.Cells(1, c1), ws.Cells(1, c2)).EntireColumn.AutoFit
    ws.Range("B1").value = t1
    ws.Range("B2").value = t2
End Sub

'--------------------------- Hierarchical gap sheets ----------------------------
' by5th = False -> "Hierarchical Gaps": the combined all-levels table first, then
' each normalized level on its own. by5th = True -> the same, keyed by 5th first.
Private Sub WriteHierarchicalGaps(ByVal ws As Worksheet, ByVal carlineRows As Collection, _
        ByVal legend As String, ByVal by5th As Boolean)
    Dim nc As Long: nc = carlineRows.Count
    Dim sfx As String: sfx = IIf(by5th, "5th", "")

    If by5th Then
        ws.name = "Hierarchical Gaps by 5th"
        BrandSheet ws, "Hierarchical Gaps by 5th", legend & _
                   "    -    'All levels combined' first, then per-level tables to its right, within each 5th split    -    " & CurrencyNote()
    Else
        ws.name = "Hierarchical Gaps"
        BrandSheet ws, "Hierarchical Gaps", legend & _
                   "    -    'All levels combined' first, then the per-level gap tables to its right    -    " & CurrencyNote()
    End If

    ' All tables laid out SIDE BY SIDE on one row: "All levels combined" first,
    ' then the four per-level tables to its right, one blank spacer between each.
    Dim comboCols As Variant, comboHdr As Variant
    If by5th Then
        comboCols = Array(CB_FIFTH, CB_L1, CB_L2, CB_L3)
        comboHdr = Array("5th", "L1 Macro System", "L2 System", "L3 Subsystem")
    Else
        comboCols = Array(CB_L1, CB_L2, CB_L3)
        comboHdr = Array("L1 Macro System", "L2 System", "L3 Subsystem")
    End If

    Dim levels As Variant, titles As Variant, names As Variant, b As Long
    levels = Array(CB_L1, CB_L2, CB_L3, CB_NORMPART)
    titles = Array("L1 Macro System", "L2 System", "L3 Subsystem", "Part Name")
    names = Array("GapL1" & sfx, "GapL2" & sfx, "GapL3" & sfx, "GapPart" & sfx)

    Dim topR As Long: topR = 4
    Dim kCombo As Long: kCombo = UBound(comboHdr) - LBound(comboHdr) + 1
    Dim kPer As Long: kPer = IIf(by5th, 2, 1)
    Dim tblW As Long: tblW = GapReportCols(kPer, nc)
    Dim curCol As Long: curCol = 2
    Dim seps As String

    ' combined all-levels table (leftmost)
    WriteGapBlock ws, topR, "All levels combined", _
                  GapReportAgg(carlineRows, comboCols), comboHdr, nc, _
                  "GapCombined" & sfx, 0, curCol
    curCol = curCol + GapReportCols(kCombo, nc)
    seps = seps & curCol & ","
    curCol = curCol + 1

    ' then the four per-level tables to its right
    For b = 0 To 3
        Dim byCols As Variant, ctxHdr As Variant
        If by5th Then
            byCols = Array(CB_FIFTH, CLng(levels(b)))
            ctxHdr = Array("5th", CStr(titles(b)))
        Else
            byCols = Array(CLng(levels(b)))
            ctxHdr = Array(CStr(titles(b)))
        End If
        WriteGapBlock ws, topR, "By " & CStr(titles(b)), _
                      GapReportAgg(carlineRows, byCols), ctxHdr, nc, _
                      CStr(names(b)), 0, curCol
        curCol = curCol + tblW
        If b < 3 Then seps = seps & curCol & ","      ' spacer column after this table
        curCol = curCol + 1
    Next b

    Dim lastCol As Long: lastCol = curCol - 1
    AutoFitData ws, 2, lastCol
    CapWidths ws, 2, lastCol, 40
    ' lean spacer columns between the side-by-side tables
    If Len(seps) > 0 Then
        Dim parts() As String, p As Long
        parts = Split(Left$(seps, Len(seps) - 1), ",")
        For p = LBound(parts) To UBound(parts)
            ws.Columns(CLng(parts(p))).ColumnWidth = 2
        Next p
    End If
End Sub

'------------------------------ gap table writer --------------------------------
' Writes one GapReportAgg / AlignedBomGap result as a lean table. ctxHeaders =
' the label column headers; value headers are Baseline / Vehicle 2..n, then per
' vehicle a [Gap Vc | Gap % Vc | Cumulative Gap % Vc] block (+ Min / Max / Spread
' when nc > 2). Each vehicle's block gets its OWN two-sided Pareto shading (first
' 80% of that vehicle's gap, red up / green down) plus a sign-coloured font - only
' the gap columns are coloured, never the whole row. Returns the row after it.
Private Function WriteGapBlock(ByVal ws As Worksheet, ByVal topRow As Long, _
        ByVal Title As String, ByRef agg As Variant, ByVal ctxHeaders As Variant, _
        ByVal nc As Long, ByVal tableName As String, ByVal maxRows As Long, _
        Optional ByVal startCol As Long = 2) As Long

    With ws.Cells(topRow, startCol)
        .value = Title
        .font.bold = True
        .font.color = NAVY
    End With

    Dim k As Long: k = UBound(ctxHeaders) - LBound(ctxHeaders) + 1
    Dim cols As Long: cols = GapReportCols(k, nc)
    Dim c As Long, j As Long, gb As Long

    ' header row: labels, TPC (Baseline + Vehicle 2..n), then per vehicle a
    ' [Gap Vc | Gap % Vc | Cumulative Gap % Vc] block, then Min / Max / Spread
    For j = 0 To k - 1
        ws.Cells(topRow + 1, startCol + j).value = ctxHeaders(LBound(ctxHeaders) + j)
    Next j
    ws.Cells(topRow + 1, startCol + k).value = "Baseline"
    For c = 2 To nc
        ws.Cells(topRow + 1, startCol + k + c - 1).value = "Vehicle " & c
    Next c
    For c = 2 To nc
        gb = startCol + k + nc + (c - 2) * 3
        ws.Cells(topRow + 1, gb).value = "Gap V" & c
        ws.Cells(topRow + 1, gb + 1).value = "Gap % V" & c
        ws.Cells(topRow + 1, gb + 2).value = "Cumulative Gap % V" & c
    Next c
    If nc > 2 Then
        ws.Cells(topRow + 1, startCol + cols - 3).value = "Min"
        ws.Cells(topRow + 1, startCol + cols - 2).value = "Max"
        ws.Cells(topRow + 1, startCol + cols - 1).value = "Spread"
    End If

    WriteGapBlock = topRow + 2
    If Not IsArray(agg) Then Exit Function

    Dim n As Long: n = UBound(agg, 1)
    If maxRows > 0 And maxRows < n Then n = maxRows

    ' body ("-" for underivable percentages)
    Dim out() As Variant, i As Long
    ReDim out(1 To n, 1 To cols)
    For i = 1 To n
        For j = 1 To cols
            If IsEmpty(agg(i, j)) Then out(i, j) = "-" Else out(i, j) = agg(i, j)
        Next j
    Next i
    ws.Cells(topRow + 2, startCol).Resize(n, cols).value = out

    ' number formats: TPC #,##0; each vehicle block = #,##0 / 0.0% / 0%
    ws.Cells(topRow + 2, startCol + k).Resize(n, nc).NumberFormat = "#,##0"
    For c = 2 To nc
        gb = startCol + k + nc + (c - 2) * 3
        ws.Cells(topRow + 2, gb).Resize(n, 1).NumberFormat = "#,##0"
        ws.Cells(topRow + 2, gb + 1).Resize(n, 1).NumberFormat = "0.0%"
        ws.Cells(topRow + 2, gb + 2).Resize(n, 1).NumberFormat = "0%"
    Next c
    If nc > 2 Then ws.Cells(topRow + 2, startCol + cols - 3).Resize(n, 3).NumberFormat = "#,##0"

    AddLeanTable ws, ws.Cells(topRow + 1, startCol).Resize(n + 1, cols), tableName

    ' per-vehicle two-sided Pareto: shade each vehicle's [Gap | Gap % | Cum %] block
    ' (ONLY those columns, not the whole row) while THAT vehicle's cumulative % is
    ' under the 80% cut; every block's font follows its own gap sign
    Dim ab As Long, cb As Long, gv As Double, gcol As Long
    For i = 1 To n
        For c = 2 To nc
            ab = k + nc + (c - 2) * 3 + 1            ' agg col of this vehicle's Gap
            cb = ab + 2                              ' its Cumulative Gap %
            gv = 0
            If IsNumeric(agg(i, ab)) Then gv = CDbl(agg(i, ab))
            If gv <> 0 And IsNumeric(agg(i, cb)) Then
                If CDbl(agg(i, cb)) < PARETO_CUT Then
                    ws.Cells(topRow + 1 + i, startCol + ab - 1).Resize(1, 3).Interior.color = _
                        IIf(gv > 0, GAP_UP_FILL, GAP_DOWN_FILL)
                End If
            End If
            If gv > 0 Then
                gcol = GAP_UP_FONT
            ElseIf gv < 0 Then
                gcol = GAP_DOWN_FONT
            Else
                gcol = -1
            End If
            If gcol <> -1 Then _
                ws.Cells(topRow + 1 + i, startCol + ab - 1).Resize(1, 3).font.color = gcol
        Next c
    Next i
    WriteGapBlock = topRow + 1 + n + 1
End Function

'============================ Data Explorer list ==============================
' Exports the (already filtered) Data Explorer table to a new workbook: one lean
' table with the same columns as page 3, TPC in each costbook's own currency and
' the Source File column as CLICKABLE hyperlinks (the reliable route to download
' the original costbooks from SharePoint). data = a modCostbookData.ExplorerData
' array (EX_ layout, incl. EX_URL). No currency badge - the table is multi-currency
' (each row carries its own Currency + TPC).
Public Function ExtractExplorerList(ByVal data As Variant) As Workbook
    If Not IsArray(data) Then Exit Function

    Dim Wb As Workbook: Set Wb = NewReportWorkbook()
    Dim ws As Worksheet: Set ws = Wb.Worksheets(1)
    ws.name = "Costbook Records"
    BrandSheet ws, "Costbook Records", _
        "One row per costbook in the database - TPC is each costbook's total in its own currency. " & _
        "Click a Source File link to download the original costbook.", False

    Dim hdr As Variant
    hdr = Array("Region", "Project", "Program", "Carline Code", "Milestone", _
                "Milestone Date", "Phase", "Currency", "TPC", "Platform", "Powertrain", _
                "PCP Team", "Reference Person", "Source File")
    Dim ncol As Long: ncol = EX_SOURCE                 ' 14 display columns
    Dim n As Long: n = UBound(data, 1)
    ws.Range("B4").Resize(1, ncol).value = hdr

    ' body (Source File left for the hyperlink pass; TPC numeric)
    Dim out() As Variant, i As Long, j As Long
    ReDim out(1 To n, 1 To ncol)
    For i = 1 To n
        For j = 1 To ncol
            If j = EX_TPC Then
                out(i, j) = CDbl(data(i, EX_TPC))
            ElseIf j = EX_SOURCE Then
                out(i, j) = ""                          ' filled as a hyperlink below
            Else
                out(i, j) = data(i, j)
            End If
        Next j
    Next i
    ws.Range("B5").Resize(n, ncol).value = out
    ws.Cells(5, 1 + EX_TPC).Resize(n, 1).NumberFormat = "#,##0"    ' TPC column (B + EX_TPC-1)

    ' Source File as clickable links (or "-" when none)
    Dim srcCol As Long: srcCol = 1 + EX_SOURCE          ' worksheet column of Source File
    Dim url As String, nm As String
    For i = 1 To n
        url = CStr(data(i, EX_URL) & "")
        nm = CStr(data(i, EX_SOURCE) & "")
        If Len(nm) = 0 Then nm = IIf(Len(url) > 0, "Open file", "-")
        If Len(url) > 0 Then
            ws.Hyperlinks.Add Anchor:=ws.Cells(4 + i, srcCol), Address:=url, TextToDisplay:=nm
        Else
            ws.Cells(4 + i, srcCol).value = nm
        End If
    Next i

    AddLeanTable ws, ws.Range("B4").Resize(n + 1, ncol), "CostbookRecords"
    AutoFitData ws, 2, 1 + ncol
    CapWidths ws, 2, 1 + ncol, 46
    FinishReport Wb
    Set ExtractExplorerList = Wb
End Function

