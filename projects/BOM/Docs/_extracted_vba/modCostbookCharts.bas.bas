Attribute VB_Name = "modCostbookCharts"
'==================================================================================
' modCostbookCharts  -  Wires data -> model -> clsShapeSurface + renderer and
' returns each visual as ONE grouped native Office shape (for the form preview
' via CopyPicture, or to paste anywhere as editable vector shapes).
'
'   BuildCostBarsGroup   - page 1 column chart (TPC by L1 Macro System, desc)
'   BuildCostPieGroup    - page 1 pie (TPC by 5th split)
'   BuildWaterfallGroup  - page 2 stacked totals + gap waterfall
'
' Shapes are emitted onto a reusable xlSheetVeryHidden scratch sheet
' (BeginTemp/EndTemp) so re-renders never churn the workbook. Every shape is
' named TPCG_<tag>_..., so DeletePriorShapes keeps re-runs idempotent.
'==================================================================================
Option Explicit

Private Const SCRATCH_SHEET As String = "TPC_ChartScratch"
Public Const NAME_PREFIX As String = "TPCG_"

Private Const xlSheetVeryHidden As Long = 2
Private Const xlSheetVisible As Long = -1

'=============================== split palette =================================
' Fixed colour per split/category label so the pie, the stacked totals and the
' report always paint e.g. "Powertrain" the same colour. Matches the Power BI
' Deneb "TPC Walk by Fifth" splitColor scale. Unknown labels fall back to a
' rotating palette.
Public Function SplitColorFor(ByVal label As String, ByVal fallbackIdx As Long) As Long
    Select Case LCase$(Trim$(label))
        Case "powertrain":            SplitColorFor = HexToArgb("#C0392B")
        Case "platform":              SplitColorFor = HexToArgb("#627384")
        Case "module", "modules":     SplitColorFor = HexToArgb("#1FA187")
        Case "top hat":               SplitColorFor = HexToArgb("#EF7D1A")
        Case "tc&other", "tc & other", "other": SplitColorFor = HexToArgb("#95A5A6")
        Case "tariffs for components":    SplitColorFor = HexToArgb("#D4AC0D")
        Case "tariffs for assembled car": SplitColorFor = HexToArgb("#7B241C")
        Case Else:                    SplitColorFor = FallbackColor(fallbackIdx)
    End Select
End Function

Public Function FallbackColor(ByVal i As Long) As Long
    Dim pal As Variant
    pal = Array("#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5", _
                "#70AD47", "#264478", "#9E480E", "#636363", "#997300")
    FallbackColor = HexToArgb(CStr(pal(i Mod 10)))
End Function

' Canonical display order of the 5th split (user spec) for the pie slices, the
' stacked total-bar segments and their legends: Powertrain, Platform, Module,
' Top Hat, TC&Other, then everything else (tariffs, economic factors, ...).
Public Function SplitOrderIndex(ByVal label As String) As Long
    Select Case LCase$(Trim$(label))
        Case "powertrain":            SplitOrderIndex = 1
        Case "platform":              SplitOrderIndex = 2
        Case "module", "modules":     SplitOrderIndex = 3
        Case "top hat":               SplitOrderIndex = 4
        Case "tc&other", "tc & other", "other": SplitOrderIndex = 5
        Case Else:                    SplitOrderIndex = 100
    End Select
End Function

' Stable reorder of a ParetoAgg result (label | TPC | % | cum %) into the
' canonical split order; unknown labels keep their TPC-desc order at the end.
Private Function OrderBySplit(ByRef agg As Variant) As Variant
    Dim n As Long: n = UBound(agg, 1)
    Dim cols As Long: cols = UBound(agg, 2)
    Dim order() As Long, i As Long, j As Long, T As Long
    ReDim order(1 To n)
    For i = 1 To n: order(i) = i: Next i
    For i = 2 To n                                   ' stable insertion sort
        T = order(i): j = i - 1
        Do While j >= 1
            If SplitOrderIndex(CStr(agg(order(j), 1))) > SplitOrderIndex(CStr(agg(T, 1))) Then
                order(j + 1) = order(j): j = j - 1
            Else
                Exit Do
            End If
        Loop
        order(j + 1) = T
    Next i
    Dim res() As Variant
    ReDim res(1 To n, 1 To cols)
    For i = 1 To n
        For j = 1 To cols: res(i, j) = agg(order(i), j): Next j
    Next i
    OrderBySplit = res
End Function

'=============================== scratch sheet =================================
' Returns the reusable scratch sheet, created VeryHidden on first use, made
' visible for the duration of a render (shapes cannot be grouped on a hidden
' sheet). Pair every BeginTemp with EndTemp in a CleanUp block.
Public Function BeginTemp() As Worksheet
    Dim ws As Worksheet
    TrcIn "BeginTemp"
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(SCRATCH_SHEET)
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
        ws.name = SCRATCH_SHEET
    End If
    ws.Visible = xlSheetVisible
    Set BeginTemp = ws
    TrcOut "BeginTemp", "shapes=" & ws.Shapes.Count
End Function

' Deletes the run's shapes and re-hides the sheet.
'
' *** THE CLIPBOARD RELEASE HAPPENS HERE, BEFORE THE DELETE, AND IT IS NOT OPTIONAL. ***
' Everything that renders a preview does grp.CopyPicture, which leaves Excel
' publishing a DELAYED-RENDER promise pointing at these very shapes (see
' modPastePicture's ole32 section). Deleting them while that promise is live is what
' makes the next workbook close - which flushes the clipboard - spin for ever.
' Releasing here means no caller can get the order wrong: the promise is always gone
' before its source is, on the normal path AND on every error path, since every
' render's CleanUp block ends in EndTemp.
' pump:=False - EndTemp also runs from form-teardown paths, where a DoEvents would
' deliver queued messages into a half-unloaded form.
Public Sub EndTemp(ByVal ws As Worksheet)
    If ws Is Nothing Then Exit Sub
    TrcIn "EndTemp"
    On Error Resume Next
    If Not ReleaseClipboard(False) Then _
        TrcAlert "EndTemp: clipboard NOT released - deleting the shapes anyway leaves " & _
                 "a dangling render promise (this is the workbook-close hang)."
    DeletePriorShapes ws, NAME_PREFIX
    ws.Visible = xlSheetVeryHidden
    On Error GoTo 0
    TrcOut "EndTemp"
End Sub

' Releases the clipboard and clears the scratch sheet WITHOUT needing the Worksheet
' the render was holding. For teardown paths (the form's QueryClose / Terminate) and
' for TpcReset: a render abandoned mid-flight - because the form was closed while it
' was drawing - leaves shapes behind that nothing else would ever delete, with Excel
' still promising to render a picture of them.
Public Sub CleanupScratch()
    TrcIn "CleanupScratch"
    On Error Resume Next
    If Not ReleaseClipboard(False) Then _
        TrcAlert "CleanupScratch: clipboard NOT released."
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(SCRATCH_SHEET)
    If Not ws Is Nothing Then
        If ws.Shapes.Count > 0 Then _
            TrcAlert "CleanupScratch: " & ws.Shapes.Count & " shape(s) left behind by an " & _
                     "abandoned render - a close happened mid-render."
        DeletePriorShapes ws, NAME_PREFIX
        ws.Visible = xlSheetVeryHidden
    End If
    On Error GoTo 0
    TrcOut "CleanupScratch"
End Sub

Public Sub DeletePriorShapes(ByVal ws As Object, ByVal prefix As String)
    Dim i As Long
    On Error Resume Next
    For i = ws.Shapes.Count To 1 Step -1
        If Left$(ws.Shapes(i).name, Len(prefix)) = prefix Then ws.Shapes(i).Delete
    Next i
    On Error GoTo 0
End Sub

'=============================== group placement ===============================
' Pins a finished chart group's bounding box to (xPt, yPt), and returns its height
' in points (0 when nothing was built).
'
' A renderer may legitimately draw above or left of its origin - the value label
' sitting on top of the tallest bar, a rotated axis caption, the legend row - and
' Office sets a GROUP's Top/Left to its topmost/leftmost CHILD, not to the surface
' origin the caller asked for. So the group as a whole can start higher up the sheet
' than its anchor cell and swallow the caption row above it. Assigning Top/Left after
' EndGroup translates the whole group so its bounding box - overhang included -
' begins exactly at the anchor. Callers that lay out content underneath should use
' the returned height rather than assuming the nominal canvas height.
Public Function PlaceGroupAt(ByVal grp As Object, ByVal xPt As Single, _
        ByVal yPt As Single) As Single
    If grp Is Nothing Then Exit Function
    On Error Resume Next
    grp.Left = xPt
    grp.top = yPt
    PlaceGroupAt = grp.Height
    On Error GoTo 0
End Function

'=============================== page 1 builders ===============================
' Column chart of TPC by L1 Macro System, sorted desc. rows = GetCostbookRows result.
Public Function BuildCostBarsGroup(ByVal ws As Object, ByVal xPt As Single, ByVal yPt As Single, _
        ByVal widthPt As Single, ByRef rows As Variant) As Object
    Dim agg As Variant
    agg = ParetoAgg(rows, CB_L1)
    If Not IsArray(agg) Then Exit Function

    Dim m As clsCatModel, i As Long, n As Long
    n = UBound(agg, 1)
    Set m = New clsCatModel
    m.widthPx = 1280: m.heightPx = 640
    m.SetSize n
    For i = 1 To n
        m.labels(i - 1) = CStr(agg(i, 1))
        m.values(i - 1) = CDbl(agg(i, 2))
        m.Colors(i - 1) = HexToArgb("#4472C4")
    Next i

    Dim surf As clsShapeSurface, ifc As IChartSurface, r As clsBarsRenderer
    Set surf = New clsShapeSurface
    surf.Init ws.Shapes, xPt, yPt, widthPt, "b"
    Set ifc = surf
    Set r = New clsBarsRenderer
    ifc.BeginGroup "CostBars"
    r.Render m, ifc
    ifc.EndGroup
    On Error Resume Next
    Set BuildCostBarsGroup = ws.Shapes(surf.LastGroupName)
    On Error GoTo 0
End Function

' Pie of TPC by the 5th split, slices in the canonical split order.
Public Function BuildCostPieGroup(ByVal ws As Object, ByVal xPt As Single, ByVal yPt As Single, _
        ByVal widthPt As Single, ByRef rows As Variant) As Object
    Dim agg As Variant
    agg = ParetoAgg(rows, CB_FIFTH)
    If Not IsArray(agg) Then Exit Function
    agg = OrderBySplit(agg)

    Dim m As clsCatModel, i As Long, n As Long
    n = UBound(agg, 1)
    Set m = New clsCatModel
    m.widthPx = 900: m.heightPx = 640
    m.SetSize n
    For i = 1 To n
        m.labels(i - 1) = CStr(agg(i, 1))
        m.values(i - 1) = CDbl(agg(i, 2))
        m.Colors(i - 1) = SplitColorFor(CStr(agg(i, 1)), i - 1)
    Next i

    Dim surf As clsShapeSurface, ifc As IChartSurface, r As clsPieRenderer
    Set surf = New clsShapeSurface
    surf.Init ws.Shapes, xPt, yPt, widthPt, "p"
    Set ifc = surf
    Set r = New clsPieRenderer
    ifc.BeginGroup "CostPie"
    r.Render m, ifc
    ifc.EndGroup
    On Error Resume Next
    Set BuildCostPieGroup = ws.Shapes(surf.LastGroupName)
    On Error GoTo 0
End Function

'=============================== page 2 builder ================================
' carlineRows: Collection of GetCostbookRows arrays (2..5 items, Baseline first),
'              ALREADY filtered by the caller when a Split (5th) value is picked.
' carLabels:   Collection of matching display labels.
' levelName:   the "Level Selection" dropdown value (L1/L2/L3/Part Name).
' The total bars are always split by the 5th column.
Public Function BuildWaterfallGroup(ByVal ws As Object, ByVal xPt As Single, ByVal yPt As Single, _
        ByVal widthPt As Single, ByVal carlineRows As Collection, ByVal carLabels As Collection, _
        ByVal levelName As String) As Object
    If carlineRows Is Nothing Then Exit Function
    If carlineRows.Count < 2 Then Exit Function

    Dim lvlCol As Long, splCol As Long
    lvlCol = LevelCol(levelName)
    splCol = CB_FIFTH

    ' ---- union of split segment labels across all carlines, stacked in the
    '      canonical split order (Powertrain, Platform, Module, Top Hat,
    '      TC&Other, then the rest by size of car 1) ---------------------------
    Dim segAgg As Variant, segLabels As Object, c As Long, i As Long
    Set segLabels = CreateObject("Scripting.Dictionary")
    segLabels.CompareMode = vbTextCompare
    For c = 1 To carlineRows.Count
        segAgg = ParetoAgg(carlineRows(c), splCol)
        If IsArray(segAgg) Then
            For i = 1 To UBound(segAgg, 1)
                If Not segLabels.Exists(CStr(segAgg(i, 1))) Then segLabels.Add CStr(segAgg(i, 1)), segLabels.Count
            Next i
        End If
    Next c
    If segLabels.Count = 0 Then Exit Function

    ' stable re-sort of the union keys by canonical order
    Dim ordKeys As Variant, a As Long, b As Long, tk As Variant
    ordKeys = segLabels.keys
    For a = LBound(ordKeys) + 1 To UBound(ordKeys)
        tk = ordKeys(a): b = a - 1
        Do While b >= LBound(ordKeys)
            If SplitOrderIndex(CStr(ordKeys(b))) > SplitOrderIndex(CStr(tk)) Then
                ordKeys(b + 1) = ordKeys(b): b = b - 1
            Else
                Exit Do
            End If
        Loop
        ordKeys(b + 1) = tk
    Next a
    segLabels.RemoveAll
    For i = LBound(ordKeys) To UBound(ordKeys)
        segLabels.Add CStr(ordKeys(i)), segLabels.Count
    Next i

    Dim m As clsWaterfallModel
    Set m = New clsWaterfallModel
    m.widthPx = 1700: m.heightPx = 700
    m.SetSize carlineRows.Count, segLabels.Count

    Dim keys As Variant: keys = segLabels.keys
    For i = 0 To segLabels.Count - 1
        m.SegLabel(i + 1) = CStr(keys(i))
        m.SegColor(i + 1) = SplitColorFor(CStr(keys(i)), i)
    Next i

    For c = 1 To carlineRows.Count
        m.CarLabel(c) = carLabels(c)
        segAgg = ParetoAgg(carlineRows(c), splCol)
        If IsArray(segAgg) Then
            For i = 1 To UBound(segAgg, 1)
                m.SegValue(c, segLabels(CStr(segAgg(i, 1))) + 1) = CDbl(segAgg(i, 2))
            Next i
        End If
    Next c

    ' ---- bridge steps: per-level gaps between consecutive carlines, biggest
    '      |gap| first, grouped into Other when > 10 ---------------------------
    For c = 1 To carlineRows.Count - 1
        Dim pair As Collection, gaps As Variant
        Set pair = New Collection
        pair.Add carlineRows(c)
        pair.Add carlineRows(c + 1)
        gaps = GapAgg(pair, lvlCol)                 ' label | v1 | v2 | gap | gap%
        If IsArray(gaps) Then
            gaps = GroupOther(gaps, 10, 2)
            Dim k As Long, nk As Long
            nk = UBound(gaps, 1)
            ReDim stepArr(1 To nk, 1 To 2) As Variant
            For k = 1 To nk
                stepArr(k, 1) = gaps(k, 1)
                stepArr(k, 2) = CDbl(gaps(k, 4))
            Next k
            m.AddSteps stepArr
        Else
            ReDim stepArr0(1 To 1, 1 To 2) As Variant
            stepArr0(1, 1) = "(no data)": stepArr0(1, 2) = 0#
            m.AddSteps stepArr0
        End If
    Next c

    Dim surf As clsShapeSurface, ifc As IChartSurface, r As clsWaterfallRenderer
    Set surf = New clsShapeSurface
    surf.Init ws.Shapes, xPt, yPt, widthPt, "w"
    Set ifc = surf
    Set r = New clsWaterfallRenderer
    ifc.BeginGroup "Waterfall"
    r.Render m, ifc
    ifc.EndGroup
    On Error Resume Next
    Set BuildWaterfallGroup = ws.Shapes(surf.LastGroupName)
    On Error GoTo 0
End Function

'=============================== PNG export ===================================
' Rasterises a grouped chart shape to a PNG file. Copies the group as a picture,
' pastes it into a throwaway ChartObject sized to the picture, and uses Excel's
' own Chart.Export (the same route clsGdiSurface falls back to). Build the group
' at a large widthPt first so the exported bitmap is crisp. Returns True on write.
Public Function ExportGroupPng(ByVal ws As Object, ByVal grp As Object, _
        ByVal filePath As String) As Boolean
    Dim cob As Object, cht As Object, pic As Object
    Dim prevSU As Boolean, prevSheet As Object
    If grp Is Nothing Then Exit Function
    TrcIn "ExportGroupPng", filePath
    On Error GoTo CleanFail

    prevSU = Application.ScreenUpdating
    Application.ScreenUpdating = False
    Set prevSheet = Application.ActiveSheet
    ws.Activate                                  ' must be active to Activate an embedded chart

    grp.CopyPicture xlScreen, xlPicture          ' vector EMF onto the clipboard

    Set cob = ws.ChartObjects.Add(0, 0, grp.width, grp.Height)
    Set cht = cob.Chart
    cob.Activate                                 ' required, else the export is blank
    cob.Border.LineStyle = xlLineStyleNone
    cht.Paste

    ' Hand the clipboard back the instant the paste has consumed it. This path used to
    ' release NOTHING: it left Excel publishing a delayed-render promise on `grp`, and
    ' the caller's CleanUp then deleted `grp` via EndTemp - a guaranteed dangling
    ' promise on every "Save PNG", and the fastest way to reproduce the workbook-close
    ' hang. Done here, while the shapes are still alive, so the revoke can succeed.
    ReleaseClipboard False

    Set pic = cht.Shapes(cht.Shapes.Count)       ' snap the frame to the pasted picture
    pic.Left = 0: pic.top = 0
    cob.width = pic.width
    cob.Height = pic.Height

    On Error Resume Next                          ' Chart.Export won't overwrite cleanly
    If Len(dir(filePath)) > 0 Then Kill filePath
    On Error GoTo CleanFail
    cht.Export filePath, "PNG"
    cob.Delete: Set cob = Nothing

    On Error Resume Next
    prevSheet.Activate
    Application.ScreenUpdating = prevSU
    On Error GoTo 0
    ExportGroupPng = (Len(dir(filePath)) > 0)
    TrcOut "ExportGroupPng", "ok=" & ExportGroupPng
    Exit Function
CleanFail:
    On Error Resume Next
    ReleaseClipboard False                       ' the CopyPicture above may still be live
    If Not cob Is Nothing Then cob.Delete
    If Not prevSheet Is Nothing Then prevSheet.Activate
    Application.ScreenUpdating = prevSU
    On Error GoTo 0
    ExportGroupPng = False
    TrcOut "ExportGroupPng", "FAILED"
End Function

