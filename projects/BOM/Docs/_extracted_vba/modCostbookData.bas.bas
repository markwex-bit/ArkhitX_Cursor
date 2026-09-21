Attribute VB_Name = "modCostbookData"
'==================================================================================
' modCostbookData  -  Data layer for the Comparison & Synthesis Generator.
'
' Sources (located by table name on any sheet, see FindTable):
'   StackedCostbooks   - one row per costbook part line. A costbook is identified
'                        by (Vehicle Code, Milestone, Milestone Date).
'   CarlinesDefinition - one row per carline; joined on Title = Vehicle Code and
'                        provides the filter attributes (region, carline_type,
'                        platform, powertrain_type) and base_currency.
'
' Everything the form charts, the bottom Pareto lists AND the exported report
' workbooks show is computed HERE, so the previews and the reports never diverge.
'
' CURRENCY: TPC is stored per costbook in its own source currency
' (CarlinesDefinition base_currency). GetCostbookRows converts every TPC to the
' selected display currency ONCE per costbook (see the "currency conversion"
' section), so all downstream aggregation, previews and reports stay in one
' currency automatically and RowTPC() just reads the already-converted value.
'==================================================================================
Option Explicit

' --- logical column order of the array returned by GetCostbookRows ------------
' (also the column order of the "Full BOM" report sheet, before the % columns
'  are inserted after CB_TPC)
Public Const CB_DATASOURCE As Long = 1
Public Const CB_VEHICLE As Long = 2
Public Const CB_MILESTONE As Long = 3
Public Const CB_MSDATE As Long = 4
Public Const CB_VSC As Long = 5
Public Const CB_PORO As Long = 6
Public Const CB_PORONAME As Long = 7
Public Const CB_MACRO As Long = 8
Public Const CB_SUBSYS As Long = 9
Public Const CB_VSCDESC As Long = 10
Public Const CB_MODCODE As Long = 11
Public Const CB_PARTDESC As Long = 12
Public Const CB_PARTNUM As Long = 13
Public Const CB_LOT As Long = 14
Public Const CB_CPSA As Long = 15
Public Const CB_MODCODEDESC As Long = 16
Public Const CB_QTY As Long = 17
Public Const CB_FIFTH As Long = 18
Public Const CB_TPC As Long = 19
Public Const CB_NORMPART As Long = 20
Public Const CB_L1 As Long = 21
Public Const CB_L2 As Long = 22
Public Const CB_L3 As Long = 23
Public Const CB_METHOD As Long = 24
Public Const CB_CONF As Long = 25
Public Const CB_COLS As Long = 25

' --- columns of the cached costbook index (CostbookIndex) ---------------------
Public Const CI_VEHICLE As Long = 1
Public Const CI_MILESTONE As Long = 2
Public Const CI_DATEKEY As Long = 3      ' "yyyy-mm-dd" (or raw text when not a date)
Public Const CI_DISPLAY As Long = 4      ' "Vehicle | Milestone | Date"
Public Const CI_REGION As Long = 5
Public Const CI_TYPE As Long = 6
Public Const CI_PLATFORM As Long = 7
Public Const CI_PTRAIN As Long = 8
Public Const CI_CURRENCY As Long = 9
Public Const CI_SEGMENT As Long = 10
Public Const CI_SOP As Long = 11     ' SOP date ("yyyy-mm-dd" or raw text)
Public Const CI_PROJECT As Long = 12
Public Const CI_PROGRAM As Long = 13
Public Const CI_PCP As Long = 14     ' pcp_team
Public Const CI_REFPERSON As Long = 15   ' Reference Person.EMail
Public Const CI_COLS As Long = 15

' --- columns of the Data Explorer display array (ExplorerData) -----------------
Public Const EX_REGION As Long = 1
Public Const EX_PROJECT As Long = 2
Public Const EX_PROGRAM As Long = 3
Public Const EX_CARLINE As Long = 4      ' = Vehicle Code
Public Const EX_MILESTONE As Long = 5
Public Const EX_MSDATE As Long = 6       ' "yyyy-mm-dd"
Public Const EX_PHASE As Long = 7
Public Const EX_CURRENCY As Long = 8
Public Const EX_TPC As Long = 9          ' Total TPC in the costbook's own currency
Public Const EX_PLATFORM As Long = 10
Public Const EX_PTRAIN As Long = 11
Public Const EX_PCP As Long = 12
Public Const EX_REFPERSON As Long = 13
Public Const EX_SOURCE As Long = 14      ' source file display name ("-" when none)
Public Const EX_URL As Long = 15         ' source file hyperlink (hidden; used to open/download)
Public Const EX_COLS As Long = 15

Public Const FILTER_ALL As String = "(All)"
' Separator packing a MULTI-value filter selection into the single filter string the
' whole filtering layer speaks (Power BI style: several values = OR). vbLf can never
' occur inside a table cell value, so it is unambiguous. "(All)" / "" still means
' "no filter", so a single-value selection is byte-identical to the old behaviour.
Public Const FILTER_SEP As String = vbLf
Public Const CUR_ORIGINAL As String = "(Source currency)"   ' no-conversion entry (generic; relabelled with the actual code, e.g. "(Source currency: EUR)")

Private mIndex As Variant        ' cached costbook index (rebuilt via LoadCostbookIndex)
Private mTotals As Object        ' "veh|ms|datekey" -> raw Total TPC (base currency), built with the index
Private mSourceFiles As Object   ' "veh|ms|datekey" -> Array(displayName, url) from CostBookRecords
Private mSourceLoaded As Boolean

' --- currency conversion state (see the "currency conversion" section) ---------
Private mTargetCurrency As String   ' "" / CUR_ORIGINAL = no conversion
Private mRates As Object            ' UCase(currency) -> Dictionary(year(Long) -> rate(Double))
Private mRatesLoaded As Boolean
Private mAttrCache As Object        ' Title -> CarlineAttributes array (region..sop)
Private mSrcCurCtx As String        ' base currency to NAME when not converting (single/uniform report)
Private mMsOrder As Object          ' milestone -> Index, from the MilestonesList table
Private mMsOrderLoaded As Boolean

'=============================== table access ==================================
' Finds a ListObject by name on ANY worksheet (exact, case-insensitive).
Public Function FindTable(ByVal tableName As String) As ListObject
    Dim ws As Worksheet, lo As ListObject
    For Each ws In ThisWorkbook.Worksheets
        For Each lo In ws.ListObjects
            If StrComp(lo.name, tableName, vbTextCompare) = 0 Then
                Set FindTable = lo
                Exit Function
            End If
        Next lo
    Next ws
End Function

' Column index of colName in lo, or 0 when blank / absent.
Public Function SafeColIndex(ByVal lo As ListObject, ByVal colName As String) As Long
    If Len(colName) = 0 Then Exit Function
    Dim lc As ListColumn
    On Error Resume Next
    Set lc = lo.ListColumns(colName)
    On Error GoTo 0
    If Not lc Is Nothing Then SafeColIndex = lc.Index
End Function

' Milestone-date cell -> stable string key "yyyy-mm-dd". Handles a real date, an
' Excel date SERIAL stored as a plain number (e.g. CostBookRecords), or raw text -
' so the same costbook keys identically across every table.
Public Function DateKeyOf(ByVal v As Variant) As String
    If IsDate(v) Then
        DateKeyOf = format$(CDate(v), "yyyy-mm-dd")
    ElseIf IsNumeric(v) Then
        On Error Resume Next
        DateKeyOf = format$(CDate(CDbl(v)), "yyyy-mm-dd")   ' serial number -> date
        On Error GoTo 0
        If Len(DateKeyOf) = 0 Then DateKeyOf = Trim$(CStr(v))
    Else
        DateKeyOf = Trim$(CStr(v))
    End If
End Function

' Reads one TPC cell as a Double (0 when blank / non-numeric). The value has
' ALREADY been converted to the selected display currency by GetCostbookRows, so
' every aggregation reading through RowTPC stays in one currency automatically.
Public Function RowTPC(ByVal v As Variant) As Double
    If IsNumeric(v) Then RowTPC = CDbl(v)
End Function

'=============================== currency conversion ===========================
' A target "display currency" can be selected in the form so costbooks stored in
' different source currencies can be compared (and shown converted). ExchangeRates
' (table "ExchangeRates": Currency | Year | Rate) is EUR-based:
'
'     1 EUR = Rate <Currency>   ->   amount(EUR) = amount(cur) / Rate(cur, year)
'
' so converting source S to target T for a given year:
'     factor = Rate(T, year) / Rate(S, year)      (Rate(EUR, year) = 1)
'
' The year the rate is read at:
'   - Milestone <> "Serial Life": the SOP year (CarlinesDefinition sop_date),
'     falling back to the Milestone Date year when SOP is absent;
'   - Milestone  = "Serial Life": the Milestone Date year.
' (Module-level state mTargetCurrency / mRates / mRatesLoaded / mAttrCache is
'  declared in the declarations section at the top of this module.)

' Selected display currency (empty / CUR_ORIGINAL = each costbook in its own currency).
Public Sub SetTargetCurrency(ByVal cur As String)
    mTargetCurrency = Trim$(cur)
End Sub
Public Function TargetCurrency() As String
    TargetCurrency = mTargetCurrency
End Function

' The conversion TARGET currency ("" when not converting = each in its own currency).
Public Function DisplayCurrency() As String
    If Not IsSourceCurrencyChoice(mTargetCurrency) Then DisplayCurrency = mTargetCurrency
End Function

' The "no conversion" combo entry, carrying the actual source currency when known:
'   "(Source currency: EUR)"   (generic CUR_ORIGINAL when unknown / mixed).
Public Function SourceCurrencyChoice(ByVal cur As String) As String
    If Len(Trim$(cur)) > 0 Then
        SourceCurrencyChoice = "(Source currency: " & Trim$(cur) & ")"
    Else
        SourceCurrencyChoice = CUR_ORIGINAL
    End If
End Function

' True for the "no conversion" entry in either form (blank or "(Source currency...").
Public Function IsSourceCurrencyChoice(ByVal cur As String) As Boolean
    IsSourceCurrencyChoice = (Len(Trim$(cur)) = 0) Or _
                             (InStr(1, cur, "(Source currency", vbTextCompare) = 1)
End Function

' base_currency (CarlinesDefinition) of one carline, "" when unknown.
Public Function CarlineCurrency(ByVal veh As String) As String
    Dim att As Variant: att = AttrsFor(veh)
    If IsArray(att) Then CarlineCurrency = Trim$(CStr(att(4)))
End Function

' A single source-currency code the reports/form can NAME while not converting (set
' to the costbook's base currency for a single-costbook report, or the shared base
' currency of a uniform comparison). "" = unknown / mixed currencies.
Public Sub SetSourceCurrencyContext(ByVal cur As String)
    mSrcCurCtx = Trim$(cur)
End Sub
Public Sub ClearSourceCurrencyContext()
    mSrcCurCtx = vbNullString
End Sub

' The currency values are actually expressed in: the conversion target if any, else
' the named source-currency context (base currency); "" when unknown / mixed.
Public Function EffectiveCurrency() As String
    Dim d As String: d = DisplayCurrency()
    If Len(d) > 0 Then EffectiveCurrency = d Else EffectiveCurrency = mSrcCurCtx
End Function

' "TPC" or "TPC (EUR)" for report column headers / key figures - names the actual
' currency (target when converting, base currency otherwise).
Public Function TpcHeader() As String
    Dim c As String: c = EffectiveCurrency()
    If Len(c) > 0 Then TpcHeader = "TPC (" & c & ")" Else TpcHeader = "TPC"
End Function

' One-line note describing the currency basis, for report subtitles / the form.
Public Function CurrencyNote() As String
    Dim d As String: d = DisplayCurrency()
    If Len(d) > 0 Then
        CurrencyNote = "All TPC converted to " & d & " (by each costbook's source currency & year)."
    ElseIf Len(mSrcCurCtx) > 0 Then
        CurrencyNote = "TPC shown in the source currency " & mSrcCurCtx & " (no conversion)."
    Else
        CurrencyNote = "TPC shown in each costbook's own source currency (no conversion)."
    End If
End Function

' CUR_ORIGINAL + EUR + the distinct ExchangeRates currencies (sorted), for the combo.
Public Function CurrencyChoices() As Variant
    LoadRates
    Dim d As Object: Set d = CreateObject("Scripting.Dictionary")
    d.CompareMode = vbTextCompare
    d.Add "EUR", True
    Dim k As Variant
    For Each k In mRates.keys
        If Not d.Exists(CStr(k)) Then d.Add CStr(k), True
    Next k
    Dim arr As Variant: arr = d.keys
    SortStrings arr
    Dim res() As Variant, n As Long
    ReDim res(0 To d.Count)
    res(0) = CUR_ORIGINAL
    For n = 0 To d.Count - 1: res(n + 1) = arr(n): Next n
    CurrencyChoices = res
End Function

' Factor one costbook's TPC is multiplied by (source currency -> target display
' currency at the costbook's year). 1 when no conversion applies, the source and
' target match, the source currency is unknown, or a rate is missing (values are
' then left in their source currency rather than silently zeroed).
Public Function CostbookConversionFactor(ByVal veh As String, ByVal ms As String, _
        ByVal dateKey As String) As Double
    CostbookConversionFactor = 1#
    Dim tgt As String: tgt = mTargetCurrency
    If IsSourceCurrencyChoice(tgt) Then Exit Function

    Dim att As Variant: att = AttrsFor(veh)
    Dim src As String
    If IsArray(att) Then src = Trim$(CStr(att(4)))        ' base_currency
    If Len(src) = 0 Then Exit Function                    ' unknown source: leave as-is
    If StrComp(src, tgt, vbTextCompare) = 0 Then Exit Function

    Dim yr As Long: yr = CostbookYear(veh, ms, dateKey)
    Dim rS As Double, rt As Double
    rS = RateFor(src, yr)
    rt = RateFor(tgt, yr)
    If rS > 0 And rt > 0 Then CostbookConversionFactor = rt / rS
End Function

' The year a costbook's rates are read at (see the section header for the rule).
Public Function CostbookYear(ByVal veh As String, ByVal ms As String, _
        ByVal dateKey As String) As Long
    Dim msYear As Long: msYear = YearOfKey(dateKey)
    If StrComp(Trim$(ms), "Serial Life", vbTextCompare) = 0 Then
        CostbookYear = msYear
    Else
        Dim att As Variant: att = AttrsFor(veh)
        Dim sopYear As Long
        If IsArray(att) Then sopYear = YearOfKey(att(6))  ' sop_date
        If sopYear > 0 Then CostbookYear = sopYear Else CostbookYear = msYear
    End If
End Function

' Year of a date-ish value ("yyyy-mm-dd" key, a real date, or raw text); 0 if none.
Public Function YearOfKey(ByVal v As Variant) As Long
    If IsDate(v) Then
        YearOfKey = Year(CDate(v))
    Else
        Dim s As String: s = Trim$(CStr(v))
        If Len(s) >= 4 Then If IsNumeric(Left$(s, 4)) Then YearOfKey = CLng(Left$(s, 4))
    End If
End Function

' EUR-based rate for a currency at a year (1 for EUR; nearest available year when
' the exact one is absent; 0 when the currency is unknown = cannot convert).
Private Function RateFor(ByVal curCode As String, ByVal yr As Long) As Double
    Dim cur As String: cur = UCase$(Trim$(curCode))
    If Len(cur) = 0 Then Exit Function
    If cur = "EUR" Then RateFor = 1#: Exit Function
    LoadRates
    If Not mRates.Exists(cur) Then Exit Function
    Dim yd As Object: Set yd = mRates(cur)
    If yd.Exists(yr) Then RateFor = CDbl(yd(yr)): Exit Function
    ' nearest available year for that currency
    Dim k As Variant, best As Long, bestDiff As Long, found As Boolean, diff As Long
    For Each k In yd.keys
        diff = Abs(CLng(k) - yr)
        If (Not found) Or diff < bestDiff Then
            found = True: bestDiff = diff: best = CLng(k)
        End If
    Next k
    If found Then RateFor = CDbl(yd(best))
End Function

' Loads ExchangeRates (Currency | Year | Rate) into mRates once per data refresh.
Private Sub LoadRates()
    If mRatesLoaded Then Exit Sub
    Set mRates = CreateObject("Scripting.Dictionary")
    mRates.CompareMode = vbTextCompare
    mRatesLoaded = True

    Dim lo As ListObject
    Set lo = FindTable("ExchangeRates")
    If lo Is Nothing Then Exit Sub
    If lo.DataBodyRange Is Nothing Then Exit Sub

    Dim data As Variant: data = lo.DataBodyRange.value
    Dim colCur As Long, cYr As Long, cRt As Long
    colCur = SafeColIndex(lo, "Currency")
    cYr = SafeColIndex(lo, "Year")
    cRt = SafeColIndex(lo, "Rate")
    If colCur = 0 Or cYr = 0 Or cRt = 0 Then Exit Sub

    Dim i As Long, cur As String, yd As Object
    For i = 1 To UBound(data, 1)
        cur = UCase$(Trim$(CStr(data(i, colCur))))
        If Len(cur) > 0 And IsNumeric(data(i, cYr)) And IsNumeric(data(i, cRt)) Then
            If mRates.Exists(cur) Then
                Set yd = mRates(cur)
            Else
                Set yd = CreateObject("Scripting.Dictionary")
                mRates.Add cur, yd
            End If
            yd(CLng(data(i, cYr))) = CDbl(data(i, cRt))    ' last row wins on a dup year
        End If
    Next i
End Sub

' CarlinesDefinition attributes for one Title (region..sop), cached with the index.
Private Function AttrsFor(ByVal veh As String) As Variant
    If mAttrCache Is Nothing Then Set mAttrCache = CarlineAttributes()
    If mAttrCache.Exists(veh) Then AttrsFor = mAttrCache(veh)
End Function

'=============================== costbook index ================================
' Distinct (Vehicle Code, Milestone, Milestone Date) combos of StackedCostbooks,
' joined to CarlinesDefinition (Title = Vehicle Code) for the filter attributes.
' Returns a 1-based 2D array (rows, CI_COLS); cached until LoadCostbookIndex is
' called again (call it on form init so a data refresh is picked up).
Public Function CostbookIndex() As Variant
    If IsEmpty(mIndex) Then LoadCostbookIndex
    CostbookIndex = mIndex
End Function

Public Sub LoadCostbookIndex()
    mIndex = Empty
    mRatesLoaded = False             ' re-read ExchangeRates on a data refresh
    mSourceLoaded = False            ' re-read CostBookRecords source files too
    Set mAttrCache = Nothing         ' re-read CarlinesDefinition attributes too
    mMsOrderLoaded = False           ' re-read the MilestonesList order too
    Set mTotals = CreateObject("Scripting.Dictionary")
    mTotals.CompareMode = vbTextCompare
    Dim lo As ListObject
    Set lo = FindTable("StackedCostbooks")
    If lo Is Nothing Then Err.Raise vbObjectError + 100, , "Table 'StackedCostbooks' not found."
    If lo.DataBodyRange Is Nothing Then Exit Sub

    Dim data As Variant: data = lo.DataBodyRange.value
    Dim cVeh As Long, cMs As Long, cDt As Long, cTpc As Long
    cVeh = SafeColIndex(lo, "Vehicle Code")
    cMs = SafeColIndex(lo, "Milestone")
    cDt = SafeColIndex(lo, "Milestone Date")
    cTpc = SafeColIndex(lo, "TPC")
    If cVeh = 0 Or cMs = 0 Or cDt = 0 Then _
        Err.Raise vbObjectError + 101, , "StackedCostbooks is missing Vehicle Code / Milestone / Milestone Date."

    ' carline attributes keyed by Title (also cached for the currency conversion)
    Dim defs As Object: Set defs = CarlineAttributes()
    Set mAttrCache = defs

    Dim seen As Object: Set seen = CreateObject("Scripting.Dictionary")
    seen.CompareMode = vbTextCompare
    Dim out() As Variant, n As Long
    ReDim out(1 To UBound(data, 1), 1 To CI_COLS)

    Dim i As Long, veh As String, ms As String, dk As String, key As String
    For i = 1 To UBound(data, 1)
        veh = Trim$(CStr(data(i, cVeh)))
        If Len(veh) > 0 Then
            ms = Trim$(CStr(data(i, cMs)))
            dk = DateKeyOf(data(i, cDt))
            key = CostbookKey(veh, ms, dk)
            If cTpc > 0 Then mTotals(key) = CDbl(mTotals(key)) + RowTPC(data(i, cTpc))  ' raw total
            If Not seen.Exists(key) Then
                seen.Add key, True
                n = n + 1
                out(n, CI_VEHICLE) = veh
                out(n, CI_MILESTONE) = ms
                out(n, CI_DATEKEY) = dk
                out(n, CI_DISPLAY) = veh & "  |  " & ms & "  |  " & dk
                Dim att As Variant
                If defs.Exists(veh) Then
                    att = defs(veh)
                    out(n, CI_REGION) = att(0)
                    out(n, CI_TYPE) = att(1)
                    out(n, CI_PLATFORM) = att(2)
                    out(n, CI_PTRAIN) = att(3)
                    out(n, CI_CURRENCY) = att(4)
                    out(n, CI_SEGMENT) = att(5)
                    out(n, CI_SOP) = att(6)
                    out(n, CI_PROJECT) = att(7)
                    out(n, CI_PROGRAM) = att(8)
                    out(n, CI_PCP) = att(9)
                    out(n, CI_REFPERSON) = att(10)
                Else
                    ' no CarlinesDefinition match: leave the attributes blank so
                    ' they never surface as filter values (still under "(All)")
                    out(n, CI_REGION) = "": out(n, CI_TYPE) = ""
                    out(n, CI_PLATFORM) = "": out(n, CI_PTRAIN) = ""
                    out(n, CI_CURRENCY) = "": out(n, CI_SEGMENT) = ""
                    out(n, CI_SOP) = ""
                    out(n, CI_PROJECT) = "": out(n, CI_PROGRAM) = ""
                    out(n, CI_PCP) = "": out(n, CI_REFPERSON) = ""
                End If
            End If
        End If
    Next i
    If n = 0 Then Exit Sub

    Dim res() As Variant, j As Long
    ReDim res(1 To n, 1 To CI_COLS)
    For i = 1 To n
        For j = 1 To CI_COLS: res(i, j) = out(i, j): Next j
    Next i
    mIndex = res
End Sub

' Title -> Array(region, carline_type, platform, powertrain_type, base_currency,
'                segment, sop_date, project, program, pcp_team, Reference Person.EMail)
Private Function CarlineAttributes() As Object
    Dim d As Object: Set d = CreateObject("Scripting.Dictionary")
    d.CompareMode = vbTextCompare
    Set CarlineAttributes = d

    Dim lo As ListObject
    Set lo = FindTable("CarlinesDefinition")
    If lo Is Nothing Then Exit Function
    If lo.DataBodyRange Is Nothing Then Exit Function

    Dim data As Variant: data = lo.DataBodyRange.value
    Dim cT As Long, cR As Long, cc As Long, cP As Long, cw As Long, cBCur As Long
    Dim cSeg As Long, cSop As Long, cPrj As Long, cPrg As Long, cPcp As Long, cRef As Long
    cT = SafeColIndex(lo, "Title")
    cR = SafeColIndex(lo, "region")
    cc = SafeColIndex(lo, "carline_type")
    cP = SafeColIndex(lo, "platform")
    cw = SafeColIndex(lo, "powertrain_type")
    cBCur = SafeColIndex(lo, "base_currency")
    cSeg = SafeColIndex(lo, "segment")
    cSop = SafeColIndex(lo, "sop_date")
    cPrj = SafeColIndex(lo, "project")
    cPrg = SafeColIndex(lo, "program")
    cPcp = SafeColIndex(lo, "pcp_team")
    cRef = SafeColIndex(lo, "Reference Person.EMail")
    If cT = 0 Then Exit Function

    Dim i As Long, k As String, sop As String
    For i = 1 To UBound(data, 1)
        k = Trim$(CStr(data(i, cT)))
        If Len(k) > 0 Then
            If Not d.Exists(k) Then
                If cSop > 0 Then sop = DateKeyOf(data(i, cSop)) Else sop = ""
                d.Add k, Array(CellStr(data, i, cR), CellStr(data, i, cc), _
                               CellStr(data, i, cP), CellStr(data, i, cw), _
                               CellStr(data, i, cBCur), CellStr(data, i, cSeg), sop, _
                               CellStr(data, i, cPrj), CellStr(data, i, cPrg), _
                               CellStr(data, i, cPcp), CellStr(data, i, cRef))
            End If
        End If
    Next i
End Function

Private Function CellStr(ByRef data As Variant, ByVal i As Long, ByVal c As Long) As String
    If c > 0 Then CellStr = Trim$(CStr(data(i, c)))
End Function

'=============================== carline detail ================================
' Full CarlinesDefinition field list surfaced in the report overviews, in display
' order. Names match the table's column headers exactly.
Public Function CarlineFieldNames() As Variant
    CarlineFieldNames = Array("Title", "project", "program", "commercial_name", _
        "pcp_team", "plant", "region", "base_currency", "sop_date", "platform", _
        "trim", "powertrain_type", "powertrain_version", _
        "CountryOrRegion0", "brand", "segment", _
        "carline_type", "Reference Person.EMail")
End Function

' Values of CarlineFieldNames for one carline (matched on CarlinesDefinition
' "Title"), in the same order. Absent carline / column -> blank; *date* columns
' returned as "yyyy-mm-dd" text. Result is a 0-based array aligned to the names.
Public Function CarlineFieldValues(ByVal Title As String) As Variant
    Dim names As Variant: names = CarlineFieldNames()
    Dim res() As Variant, i As Long
    ReDim res(LBound(names) To UBound(names))
    For i = LBound(names) To UBound(names): res(i) = "": Next i
    CarlineFieldValues = res

    Dim lo As ListObject
    Set lo = FindTable("CarlinesDefinition")
    If lo Is Nothing Then Exit Function
    If lo.DataBodyRange Is Nothing Then Exit Function

    Dim data As Variant: data = lo.DataBodyRange.value
    Dim cT As Long: cT = SafeColIndex(lo, "Title")
    If cT = 0 Then Exit Function

    Dim rIdx As Long, rr As Long
    For rr = 1 To UBound(data, 1)
        If StrComp(Trim$(CStr(data(rr, cT))), Title, vbTextCompare) = 0 Then rIdx = rr: Exit For
    Next rr
    If rIdx = 0 Then Exit Function

    Dim col As Long, nm As String
    For i = LBound(names) To UBound(names)
        nm = CStr(names(i))
        col = SafeColIndex(lo, nm)
        If col > 0 Then
            If LCase$(nm) Like "*date*" Then
                res(i) = DateKeyOf(data(rIdx, col))
            Else
                res(i) = data(rIdx, col)
            End If
        End If
    Next i
    CarlineFieldValues = res
End Function

'=============================== milestone order ===============================
' Milestones have a LIFECYCLE order - IM, PM, CM, ... SOPM, Serial Life - and that
' is the only order that reads correctly in a filter list; alphabetical scatters
' them. The order comes from the MilestonesList table (sheet "Config": columns
' "Milestone" and "Index"). FindTable searches every sheet, so the table can move.
'
' Milestones present in the data but absent from MilestonesList are NOT dropped:
' they sort last, alphabetically among themselves, so a new milestone shows up in
' the filter the moment data arrives, before anyone updates Config.
Private Function MilestoneOrder() As Object
    If mMsOrderLoaded Then
        Set MilestoneOrder = mMsOrder
        Exit Function
    End If
    Set mMsOrder = CreateObject("Scripting.Dictionary")
    mMsOrder.CompareMode = vbTextCompare
    mMsOrderLoaded = True

    Dim lo As ListObject
    Set lo = FindTable("MilestonesList")
    If lo Is Nothing Then GoTo Ready
    If lo.DataBodyRange Is Nothing Then GoTo Ready

    Dim cMs As Long, cIx As Long
    cMs = SafeColIndex(lo, "Milestone")
    If cMs = 0 Then GoTo Ready
    cIx = SafeColIndex(lo, "Index")

    Dim data As Variant: data = lo.DataBodyRange.value
    Dim i As Long, k As String, v As Double
    For i = 1 To UBound(data, 1)
        k = Trim$(CStr(data(i, cMs) & ""))
        If Len(k) > 0 Then
            v = i                                    ' no Index column -> table order
            If cIx > 0 Then
                If IsNumeric(data(i, cIx)) Then v = CDbl(data(i, cIx))
            End If
            If Not mMsOrder.Exists(k) Then mMsOrder.Add k, v
        End If
    Next i
Ready:
    Set MilestoneOrder = mMsOrder
End Function

' Rank of one milestone; unlisted ones get a rank past every real Index.
Private Function MilestoneRank(ByVal ord As Object, ByVal ms As Variant) As Double
    Dim k As String: k = Trim$(CStr(ms))
    If ord.Exists(k) Then
        MilestoneRank = CDbl(ord(k))
    Else
        MilestoneRank = 1E+15
    End If
End Function

' Sorts a milestone array by MilestonesList Index (insertion sort, same shape as
' SortStrings), falling back to alphabetical for equal / unknown ranks.
Private Sub SortMilestones(ByRef arr As Variant)
    On Error Resume Next
    If UBound(arr) < LBound(arr) Then Exit Sub
    On Error GoTo 0
    Dim ord As Object: Set ord = MilestoneOrder()
    Dim i As Long, j As Long, T As Variant, rt As Double, rj As Double
    For i = LBound(arr) + 1 To UBound(arr)
        T = arr(i): rt = MilestoneRank(ord, T): j = i - 1
        Do While j >= LBound(arr)
            rj = MilestoneRank(ord, arr(j))
            If rj > rt Or (rj = rt And StrComp(CStr(arr(j)), CStr(T), vbTextCompare) > 0) Then
                arr(j + 1) = arr(j): j = j - 1
            Else
                Exit Do
            End If
        Loop
        arr(j + 1) = T
    Next i
End Sub

'=============================== filtering =====================================
' True when an index row passes the five filters ("(All)" or "" = no filter).
Private Function PassesFilters(ByRef idx As Variant, ByVal i As Long, _
        ByVal region As String, ByVal ctype As String, _
        ByVal platform As String, ByVal ptrain As String, _
        ByVal milestone As String) As Boolean
    PassesFilters = FilterOk(idx(i, CI_REGION), region) _
                And FilterOk(idx(i, CI_TYPE), ctype) _
                And FilterOk(idx(i, CI_PLATFORM), platform) _
                And FilterOk(idx(i, CI_PTRAIN), ptrain) _
                And FilterOk(idx(i, CI_MILESTONE), milestone)
End Function

' A filter string is either "" / "(All)" (no filter), ONE value, or several values
' joined with FILTER_SEP - in which case a row passes when it matches ANY of them
' (Power BI multi-select semantics). This is the single choke point every filter on
' every page goes through (PassesFilters + ExplorerRowPasses), so multi-select works
' across the whole cascade from here alone.
Private Function FilterOk(ByVal v As Variant, ByVal flt As String) As Boolean
    If Len(flt) = 0 Or flt = FILTER_ALL Then
        FilterOk = True
        Exit Function
    End If
    Dim s As String: s = CStr(v)
    If InStr(1, flt, FILTER_SEP, vbBinaryCompare) = 0 Then      ' single value: fast path
        FilterOk = (StrComp(s, flt, vbTextCompare) = 0)
        Exit Function
    End If
    Dim parts() As String, i As Long
    parts = Split(flt, FILTER_SEP)
    For i = LBound(parts) To UBound(parts)
        If StrComp(s, parts(i), vbTextCompare) = 0 Then
            FilterOk = True
            Exit Function
        End If
    Next i
End Function

' Distinct values of one CI_ attribute among costbooks passing the OTHER filters
' (pass "(All)" for the attribute itself). Sorted, prefixed with "(All)".
' Blank / "?" placeholder values are not offered (those rows stay under "(All)").
' Because the values are collected FROM the index, a milestone with no costbook
' behind it never reaches the list.
Public Function DistinctAttr(ByVal attrCol As Long, ByVal region As String, _
        ByVal ctype As String, ByVal platform As String, ByVal ptrain As String, _
        ByVal milestone As String) As Variant
    Dim idx As Variant: idx = CostbookIndex()
    Dim d As Object: Set d = CreateObject("Scripting.Dictionary")
    d.CompareMode = vbTextCompare
    Dim i As Long, k As String
    If IsArray(idx) Then
        For i = 1 To UBound(idx, 1)
            If PassesFilters(idx, i, region, ctype, platform, ptrain, milestone) Then
                k = Trim$(CStr(idx(i, attrCol)))
                If Len(k) > 0 And k <> "?" Then
                    If Not d.Exists(k) Then d.Add k, True
                End If
            End If
        Next i
    End If
    Dim arr As Variant: arr = d.keys
    If attrCol = CI_MILESTONE Then SortMilestones arr Else SortStrings arr
    Dim res() As Variant, n As Long
    ReDim res(0 To d.Count)
    res(0) = FILTER_ALL
    For n = 0 To d.Count - 1: res(n + 1) = arr(n): Next n
    DistinctAttr = res
End Function

' Index rows (2D array, CI_COLS wide) of the costbooks that pass the filters,
' sorted by display label. Returns Empty when none match.
Public Function FilteredCostbooks(ByVal region As String, ByVal ctype As String, _
        ByVal platform As String, ByVal ptrain As String, _
        ByVal milestone As String) As Variant
    Dim idx As Variant: idx = CostbookIndex()
    If Not IsArray(idx) Then Exit Function

    Dim keep() As Long, n As Long, i As Long, j As Long
    ReDim keep(1 To UBound(idx, 1))
    For i = 1 To UBound(idx, 1)
        If PassesFilters(idx, i, region, ctype, platform, ptrain, milestone) Then
            n = n + 1: keep(n) = i
        End If
    Next i
    If n = 0 Then Exit Function

    ' insertion-sort the kept rows by display label
    Dim k As Long, T As Long
    For i = 2 To n
        T = keep(i): k = i - 1
        Do While k >= 1
            If StrComp(idx(keep(k), CI_DISPLAY), idx(T, CI_DISPLAY), vbTextCompare) > 0 Then
                keep(k + 1) = keep(k): k = k - 1
            Else
                Exit Do
            End If
        Loop
        keep(k + 1) = T
    Next i

    Dim res() As Variant
    ReDim res(1 To n, 1 To CI_COLS)
    For i = 1 To n
        For j = 1 To CI_COLS: res(i, j) = idx(keep(i), j): Next j
    Next i
    FilteredCostbooks = res
End Function

'=============================== costbook rows =================================
' All StackedCostbooks rows of ONE costbook (veh, ms, dateKey as from DateKeyOf),
' as a 1-based 2D array in the CB_ logical column order, SORTED BY TPC DESC.
' Returns Empty when the costbook has no rows.
Public Function GetCostbookRows(ByVal veh As String, ByVal ms As String, _
                                ByVal dateKey As String) As Variant
    Dim lo As ListObject
    Set lo = FindTable("StackedCostbooks")
    If lo Is Nothing Then Exit Function
    If lo.DataBodyRange Is Nothing Then Exit Function

    Dim data As Variant: data = lo.DataBodyRange.value

    ' physical column of each logical column
    Dim src(1 To CB_COLS) As Long
    src(CB_DATASOURCE) = SafeColIndex(lo, "Data Source")
    src(CB_VEHICLE) = SafeColIndex(lo, "Vehicle Code")
    src(CB_MILESTONE) = SafeColIndex(lo, "Milestone")
    src(CB_MSDATE) = SafeColIndex(lo, "Milestone Date")
    src(CB_VSC) = SafeColIndex(lo, "VSC")
    src(CB_PORO) = SafeColIndex(lo, "Poro")
    src(CB_PORONAME) = SafeColIndex(lo, "PoRo Name")
    src(CB_MACRO) = SafeColIndex(lo, "Macro System")
    src(CB_SUBSYS) = SafeColIndex(lo, "Subsystem")
    src(CB_VSCDESC) = SafeColIndex(lo, "VSC Description")
    src(CB_MODCODE) = SafeColIndex(lo, "Module Code")
    src(CB_PARTDESC) = SafeColIndex(lo, "Part Description")
    src(CB_PARTNUM) = SafeColIndex(lo, "Part Number")
    src(CB_LOT) = SafeColIndex(lo, "LOT")
    src(CB_CPSA) = SafeColIndex(lo, "CPSA")
    src(CB_MODCODEDESC) = SafeColIndex(lo, "Module Code Description")
    src(CB_QTY) = SafeColIndex(lo, "Qty")
    src(CB_FIFTH) = SafeColIndex(lo, "5th")
    src(CB_TPC) = SafeColIndex(lo, "TPC")
    src(CB_NORMPART) = SafeColIndex(lo, "Normalized Part Name (EN)")
    src(CB_L1) = SafeColIndex(lo, "L1 Macro System")
    If src(CB_L1) = 0 Then src(CB_L1) = SafeColIndex(lo, "L1 Domain")   ' pre-rename fallback
    src(CB_L2) = SafeColIndex(lo, "L2 System")
    src(CB_L3) = SafeColIndex(lo, "L3 Subsystem")
    src(CB_METHOD) = SafeColIndex(lo, "Classification Method")
    src(CB_CONF) = SafeColIndex(lo, "Confidence")

    Dim rows() As Long, n As Long, i As Long
    ReDim rows(1 To UBound(data, 1))
    For i = 1 To UBound(data, 1)
        If StrComp(Trim$(CStr(data(i, src(CB_VEHICLE)))), veh, vbTextCompare) = 0 Then
            If StrComp(Trim$(CStr(data(i, src(CB_MILESTONE)))), ms, vbTextCompare) = 0 Then
                If DateKeyOf(data(i, src(CB_MSDATE))) = dateKey Then
                    n = n + 1: rows(n) = i
                End If
            End If
        End If
    Next i
    If n = 0 Then Exit Function

    ' sort kept rows by TPC descending (insertion sort; n is a few hundred)
    Dim k As Long, T As Long
    For i = 2 To n
        T = rows(i): k = i - 1
        Do While k >= 1
            If RowTPC(data(rows(k), src(CB_TPC))) < RowTPC(data(T, src(CB_TPC))) Then
                rows(k + 1) = rows(k): k = k - 1
            Else
                Exit Do
            End If
        Loop
        rows(k + 1) = T
    Next i

    ' convert every TPC to the selected display currency ONCE for this costbook
    ' (factor is constant per costbook, so the TPC-desc sort above is unaffected)
    Dim factor As Double: factor = CostbookConversionFactor(veh, ms, dateKey)

    Dim res() As Variant, c As Long
    ReDim res(1 To n, 1 To CB_COLS)
    For i = 1 To n
        For c = 1 To CB_COLS
            If src(c) > 0 Then res(i, c) = data(rows(i), src(c))
        Next c
        If factor <> 1# And IsNumeric(res(i, CB_TPC)) Then _
            res(i, CB_TPC) = CDbl(res(i, CB_TPC)) * factor
        If IsDate(res(i, CB_MSDATE)) Then res(i, CB_MSDATE) = DateKeyOf(res(i, CB_MSDATE))
    Next i
    GetCostbookRows = res
End Function

' Total TPC of a rows array from GetCostbookRows.
Public Function TotalTPC(ByRef rows As Variant) As Double
    Dim i As Long
    If Not IsArray(rows) Then Exit Function
    For i = 1 To UBound(rows, 1)
        TotalTPC = TotalTPC + RowTPC(rows(i, CB_TPC))
    Next i
End Function

'=============================== aggregation ===================================
' Sums TPC by the labels of one CB_ column. Returns a 1-based 2D array
' (1..m, 1..4): label | TPC | TPC % | cumulative %, sorted by TPC descending.
' Empty when rows is not an array. Blank labels are bucketed as "(blank)".
Public Function ParetoAgg(ByRef rows As Variant, ByVal byCol As Long) As Variant
    If Not IsArray(rows) Then Exit Function
    Dim d As Object: Set d = CreateObject("Scripting.Dictionary")
    d.CompareMode = vbTextCompare

    Dim i As Long, k As String, total As Double, v As Double
    For i = 1 To UBound(rows, 1)
        k = Trim$(CStr(rows(i, byCol) & ""))
        If Len(k) = 0 Then k = "(blank)"
        v = RowTPC(rows(i, CB_TPC))
        d(k) = CDbl(d(k)) + v         ' missing key reads as Empty -> 0
        total = total + v
    Next i
    If d.Count = 0 Then Exit Function

    Dim labels As Variant, vals() As Double, m As Long
    labels = d.keys
    m = d.Count
    ReDim vals(0 To m - 1)
    For i = 0 To m - 1: vals(i) = CDbl(d(labels(i))): Next i
    SortByValueDesc labels, vals

    Dim res() As Variant, cum As Double
    ReDim res(1 To m, 1 To 4)
    For i = 0 To m - 1
        res(i + 1, 1) = labels(i)
        res(i + 1, 2) = vals(i)
        If total <> 0 Then res(i + 1, 3) = vals(i) / total Else res(i + 1, 3) = 0
        cum = cum + res(i + 1, 3)
        res(i + 1, 4) = cum
    Next i
    ParetoAgg = res
End Function

' First topN rows of a ParetoAgg result (or all of them when fewer).
Public Function TopN(ByRef agg As Variant, ByVal topCount As Long) As Variant
    If Not IsArray(agg) Then Exit Function
    Dim n As Long: n = UBound(agg, 1)
    If topCount < n Then n = topCount
    Dim res() As Variant, i As Long, j As Long
    ReDim res(1 To n, 1 To 4)
    For i = 1 To n
        For j = 1 To 4: res(i, j) = agg(i, j): Next j
    Next i
    TopN = res
End Function

'=============================== gap analysis ==================================
' Compares 2..5 costbooks by the labels of one CB_ column. carlineRows is a
' Collection of rows-arrays (from GetCostbookRows), first = V1 ... last = Vn.
' Returns (1..m, 1..nCars+3): label | TPC V1..Vn | gap(last-first) | gap frac
' (Empty when first value is 0), sorted by |gap| DESC.
Public Function GapAgg(ByVal carlineRows As Collection, ByVal byCol As Long) As Variant
    If carlineRows Is Nothing Then Exit Function
    If carlineRows.Count < 2 Then Exit Function

    Dim nc As Long: nc = carlineRows.Count
    Dim d As Object: Set d = CreateObject("Scripting.Dictionary")
    d.CompareMode = vbTextCompare

    Dim c As Long, i As Long, k As String, rows As Variant, arr As Variant
    For c = 1 To nc
        rows = carlineRows(c)
        If IsArray(rows) Then
            For i = 1 To UBound(rows, 1)
                k = Trim$(CStr(rows(i, byCol) & ""))
                If Len(k) = 0 Then k = "(blank)"
                If Not d.Exists(k) Then
                    ReDim arr(1 To nc) As Double
                    d.Add k, arr
                End If
                arr = d(k)
                arr(c) = arr(c) + RowTPC(rows(i, CB_TPC))
                d(k) = arr
            Next i
        End If
    Next c
    If d.Count = 0 Then Exit Function

    Dim labels As Variant, gaps() As Double, m As Long
    labels = d.keys
    m = d.Count
    ReDim gaps(0 To m - 1)
    For i = 0 To m - 1
        arr = d(labels(i))
        gaps(i) = Abs(arr(nc) - arr(1))
    Next i
    SortByValueDesc labels, gaps

    Dim res() As Variant, j As Long, gap As Double
    ReDim res(1 To m, 1 To nc + 3)
    For i = 0 To m - 1
        arr = d(labels(i))
        res(i + 1, 1) = labels(i)
        For j = 1 To nc: res(i + 1, 1 + j) = arr(j): Next j
        gap = arr(nc) - arr(1)
        res(i + 1, nc + 2) = gap
        If arr(1) <> 0 Then res(i + 1, nc + 3) = gap / arr(1)   ' Else Empty = "-"
    Next i
    GapAgg = res
End Function

' Keeps the maxItems biggest rows of a GapAgg / ParetoAgg style array (already
' sorted) and folds the remainder into one "Other" row (values summed, % and gap
' recomputed where derivable). valueCols = number of numeric columns straight
' after the label that must be summed.
Public Function GroupOther(ByRef agg As Variant, ByVal maxItems As Long, _
                           ByVal valueCols As Long) As Variant
    If Not IsArray(agg) Then Exit Function
    Dim m As Long: m = UBound(agg, 1)
    If m <= maxItems Then GroupOther = agg: Exit Function

    Dim cols As Long: cols = UBound(agg, 2)
    Dim res() As Variant, i As Long, j As Long
    ReDim res(1 To maxItems + 1, 1 To cols)
    For i = 1 To maxItems
        For j = 1 To cols: res(i, j) = agg(i, j): Next j
    Next i
    res(maxItems + 1, 1) = "Other"
    For j = 2 To 1 + valueCols
        Dim s As Double: s = 0
        For i = maxItems + 1 To m
            If IsNumeric(agg(i, j)) Then s = s + CDbl(agg(i, j))
        Next i
        res(maxItems + 1, j) = s
    Next j
    ' recompute trailing gap / gap% when the layout is a GapAgg (label, v1..vn, gap, gap%)
    If cols = valueCols + 3 Then
        res(maxItems + 1, cols - 1) = CDbl(res(maxItems + 1, 1 + valueCols)) - CDbl(res(maxItems + 1, 2))
        If CDbl(res(maxItems + 1, 2)) <> 0 Then _
            res(maxItems + 1, cols) = CDbl(res(maxItems + 1, cols - 1)) / CDbl(res(maxItems + 1, 2))
    End If
    GroupOther = res
End Function

'=========================== gap report aggregation ============================
' Aggregates 2..5 costbooks by one or more CB_ label columns for the Gap
' Comparison report. byCols = Array(CB_..., ...) - 1+ label columns forming a
' composite key (e.g. L1+L2+L3 for the combined hierarchy table).
'
' Layout of the returned 1-based 2D array (k = number of label columns,
' nc = number of carlines, Baseline = carline 1):
'   1 .. k                     label columns
'   k+1 .. k+nc                TPC per carline (Baseline first)
'   then per vehicle c = 2..nc, a 3-column block:
'     Gap Vc (Vc - Baseline) | Gap % Vc (share of Vc's total +/- gap) | Cumulative Gap % Vc
'   [+ Min | Max | Spread]     only when nc > 2
'
' Rows are ordered as a TWO-SIDED Pareto on the "primary gap" = LAST carline -
' Baseline: cost increases (gap > 0) biggest first, then cost decreases (gap < 0)
' biggest |gap| first, then unchanged rows. Each Cumulative Gap % Vc accumulates
' WITHIN Vc's own +/- side (share of that vehicle's total |gap|), so the report
' can band the first 80% of the primary increases/decreases.
Public Function GapReportAgg(ByVal carlineRows As Collection, ByVal byCols As Variant) As Variant
    If carlineRows Is Nothing Then Exit Function
    If carlineRows.Count < 2 Then Exit Function

    Dim k As Long: k = UBound(byCols) - LBound(byCols) + 1
    Dim nc As Long: nc = carlineRows.Count

    ' capacity = total number of source rows (worst case: no key repeats)
    Dim cap As Long, c As Long, rows As Variant
    For c = 1 To nc
        rows = carlineRows(c)
        If IsArray(rows) Then cap = cap + UBound(rows, 1)
    Next c
    If cap = 0 Then Exit Function

    Dim ctx() As Variant, vals() As Double, m As Long
    ReDim ctx(1 To cap, 1 To k)
    ReDim vals(1 To cap, 1 To nc)

    Dim d As Object: Set d = CreateObject("Scripting.Dictionary")
    d.CompareMode = vbTextCompare

    Dim i As Long, j As Long, key As String, part As String, idx As Long
    For c = 1 To nc
        rows = carlineRows(c)
        If IsArray(rows) Then
            For i = 1 To UBound(rows, 1)
                key = ""
                For j = LBound(byCols) To UBound(byCols)
                    part = Trim$(CStr(rows(i, CLng(byCols(j))) & ""))
                    If Len(part) = 0 Then part = "(blank)"
                    key = key & "|" & part
                Next j
                If d.Exists(key) Then
                    idx = d(key)
                Else
                    m = m + 1: idx = m
                    d.Add key, idx
                    For j = LBound(byCols) To UBound(byCols)
                        part = Trim$(CStr(rows(i, CLng(byCols(j))) & ""))
                        If Len(part) = 0 Then part = "(blank)"
                        ctx(idx, j - LBound(byCols) + 1) = part
                    Next j
                End If
                vals(idx, c) = vals(idx, c) + RowTPC(rows(i, CB_TPC))
            Next i
        End If
    Next c
    GapReportAgg = ComposeGapReport(ctx, vals, m, k, nc)
End Function

' Ordered part-descriptive columns carried into the aligned BOM comparison -
' everything except the per-costbook identity (Vehicle/Milestone/Date/Data Source)
' and TPC, which become the compared value columns. Kept next to AlignedBomGap so
' the report's headers stay in lockstep with the data.
Public Function BomComparisonCtxCols() As Variant
    BomComparisonCtxCols = Array(CB_VSC, CB_PORO, CB_PORONAME, CB_MACRO, CB_SUBSYS, _
        CB_VSCDESC, CB_MODCODE, CB_PARTDESC, CB_PARTNUM, CB_LOT, CB_CPSA, _
        CB_MODCODEDESC, CB_QTY, CB_FIFTH, CB_NORMPART, CB_L1, CB_L2, CB_L3, _
        CB_METHOD, CB_CONF)
End Function

' Display headers matching BomComparisonCtxCols, in the same order.
Public Function BomComparisonCtxHeaders() As Variant
    BomComparisonCtxHeaders = Array("VSC", "Poro", "PoRo Name", "Macro System", _
        "Subsystem", "VSC Description", "Module Code", "Part Description", _
        "Part Number", "LOT", "CPSA", "Module Code Description", "Qty", "5th", _
        "Normalized Part Name (EN)", "L1 Macro System", "L2 System", "L3 Subsystem", _
        "Classification Method", "Confidence")
End Function

' Aligns the full BOMs of 2..5 costbooks line-by-line for the "Full BOM
' Comparison" sheet: lines are matched across carlines by Part Number (falling
' back to Part Description when the number is blank), and the n-th occurrence of
' a key in one BOM aligns with the n-th occurrence in the others. Lines missing
' from a carline keep their own row with that carline at 0.
'
' Label columns = BomComparisonCtxCols (all descriptive columns: VSC, Qty, ...),
' taken from the first carline that carries each line, followed by the same
' value/gap tail as GapReportAgg (per-carline TPC, gaps, Gap %, Cumulative %).
Public Function AlignedBomGap(ByVal carlineRows As Collection) As Variant
    If carlineRows Is Nothing Then Exit Function
    If carlineRows.Count < 2 Then Exit Function

    Dim ctxCols As Variant: ctxCols = BomComparisonCtxCols()
    Dim K_CTX As Long: K_CTX = UBound(ctxCols) - LBound(ctxCols) + 1
    Dim nc As Long: nc = carlineRows.Count

    Dim cap As Long, c As Long, rows As Variant
    For c = 1 To nc
        rows = carlineRows(c)
        If IsArray(rows) Then cap = cap + UBound(rows, 1)
    Next c
    If cap = 0 Then Exit Function

    Dim ctx() As Variant, vals() As Double, m As Long
    ReDim ctx(1 To cap, 1 To K_CTX)
    ReDim vals(1 To cap, 1 To nc)

    Dim slots As Object: Set slots = CreateObject("Scripting.Dictionary")
    slots.CompareMode = vbTextCompare

    Dim i As Long, idx As Long, baseKey As String, key As String, jj As Long
    Dim seen As Object
    For c = 1 To nc
        rows = carlineRows(c)
        If IsArray(rows) Then
            ' per-carline occurrence counter, so duplicate part lines align 1:1
            Set seen = CreateObject("Scripting.Dictionary")
            seen.CompareMode = vbTextCompare
            For i = 1 To UBound(rows, 1)
                baseKey = LCase$(Trim$(CStr(rows(i, CB_PARTNUM) & "")))
                If Len(baseKey) = 0 Then _
                    baseKey = "desc|" & LCase$(Trim$(CStr(rows(i, CB_PARTDESC) & "")))
                seen(baseKey) = CLng(seen(baseKey)) + 1      ' Empty reads as 0
                key = baseKey & "#" & CLng(seen(baseKey))
                If slots.Exists(key) Then
                    idx = slots(key)
                Else
                    m = m + 1: idx = m
                    slots.Add key, idx
                    For jj = LBound(ctxCols) To UBound(ctxCols)
                        ctx(idx, jj - LBound(ctxCols) + 1) = _
                            Trim$(CStr(rows(i, CLng(ctxCols(jj))) & ""))
                    Next jj
                End If
                vals(idx, c) = vals(idx, c) + RowTPC(rows(i, CB_TPC))
            Next i
        End If
    Next c
    AlignedBomGap = ComposeGapReport(ctx, vals, m, K_CTX, nc)
End Function

' Number of columns a GapReportAgg / AlignedBomGap result has for k label
' columns and nc carlines (kept here so writers never hard-code the layout).
'   labels(k) + TPC(nc) + per-vehicle [Gap, Gap%, Cumulative Gap%] (3*(nc-1))
'   + Min/Max/Spread when nc > 2
Public Function GapReportCols(ByVal k As Long, ByVal nc As Long) As Long
    GapReportCols = k + nc + 3 * (nc - 1) + IIf(nc > 2, 3, 0)
End Function

' Shared tail of GapReportAgg / AlignedBomGap: sorts the m aggregated rows as a
' two-sided Pareto and appends gaps, Gap %, side-cumulative Gap % and (nc > 2)
' Min / Max / Spread. ctx = labels (m x k), vals = TPC (m x nc).
Private Function ComposeGapReport(ByRef ctx As Variant, ByRef vals() As Double, _
        ByVal m As Long, ByVal k As Long, ByVal nc As Long) As Variant
    If m = 0 Then Exit Function

    ' primary gap (last - baseline) drives the row ORDER + side class:
    ' 0 = increase, 1 = decrease, 2 = unchanged (kept last, sides contiguous)
    Dim gap() As Double, cls() As Long, order() As Long
    ReDim gap(1 To m): ReDim cls(1 To m): ReDim order(1 To m)
    Dim i As Long
    For i = 1 To m
        gap(i) = vals(i, nc) - vals(i, 1)
        order(i) = i
        If gap(i) > 0 Then
            cls(i) = 0
        ElseIf gap(i) < 0 Then
            cls(i) = 1
        Else
            cls(i) = 2
        End If
    Next i

    ' insertion sort: by side class, then |gap| descending
    Dim a As Long, b As Long, T As Long
    For a = 2 To m
        T = order(a): b = a - 1
        Do While b >= 1
            If cls(order(b)) > cls(T) Or _
               (cls(order(b)) = cls(T) And Abs(gap(order(b))) < Abs(gap(T))) Then
                order(b + 1) = order(b): b = b - 1
            Else
                Exit Do
            End If
        Loop
        order(b + 1) = T
    Next a

    ' per-vehicle side totals, so each Vc gets its OWN cumulative Gap %
    Dim totPosC() As Double, totNegC() As Double, c As Long, g As Double
    ReDim totPosC(2 To nc): ReDim totNegC(2 To nc)
    For i = 1 To m
        For c = 2 To nc
            g = vals(i, c) - vals(i, 1)
            If g > 0 Then
                totPosC(c) = totPosC(c) + g
            ElseIf g < 0 Then
                totNegC(c) = totNegC(c) + Abs(g)
            End If
        Next c
    Next i

    ' Each vehicle's Cumulative Gap % is a Pareto in ITS OWN gap ranking - NOT the
    ' table's row order (which follows the primary / last vehicle). Precompute it
    ' per vehicle, keyed by original row index, so V2 is as correct as the last Vn.
    Dim cumV() As Variant, c2 As Long
    ReDim cumV(1 To m, 2 To nc)
    For c2 = 2 To nc
        FillVehCumulative vals, m, c2, totPosC(c2), totNegC(c2), cumV
    Next c2

    Dim cols As Long: cols = GapReportCols(k, nc)
    Dim res() As Variant, r As Long, j As Long, src As Long, base As Long
    Dim mn As Double, mx As Double
    ReDim res(1 To m, 1 To cols)
    For r = 1 To m
        src = order(r)
        For j = 1 To k: res(r, j) = ctx(src, j): Next j
        For j = 1 To nc: res(r, k + j) = vals(src, j): Next j
        For c = 2 To nc
            base = k + nc + (c - 2) * 3
            g = vals(src, c) - vals(src, 1)
            res(r, base + 1) = g                                          ' Gap Vc
            ' Gap % Vc = this gap / its side's total gap (a positive share)
            If g > 0 Then
                If totPosC(c) > 0 Then res(r, base + 2) = g / totPosC(c)
            ElseIf g < 0 Then
                If totNegC(c) > 0 Then res(r, base + 2) = Abs(g) / totNegC(c)
            End If
            res(r, base + 3) = cumV(src, c)          ' Cumulative Gap % Vc (own Pareto)
        Next c
        If nc > 2 Then
            mn = vals(src, 1): mx = vals(src, 1)
            For j = 2 To nc
                If vals(src, j) < mn Then mn = vals(src, j)
                If vals(src, j) > mx Then mx = vals(src, j)
            Next j
            res(r, cols - 2) = mn
            res(r, cols - 1) = mx
            res(r, cols) = mx - mn
        End If
    Next r
    ComposeGapReport = res
End Function

' Fills cumV(:, c) with vehicle c's Cumulative Gap %, ranking rows by that
' vehicle's OWN |gap| within side (increases biggest-first, then decreases), so
' each vehicle's Pareto is correct independent of the table's (primary-driven)
' row order. cumV is keyed by ORIGINAL row index; gap-0 rows stay Empty.
Private Sub FillVehCumulative(ByRef vals() As Double, ByVal m As Long, ByVal c As Long, _
        ByVal totPos As Double, ByVal totNeg As Double, ByRef cumV() As Variant)
    Dim g() As Double, ord() As Long, i As Long
    ReDim g(1 To m): ReDim ord(1 To m)
    For i = 1 To m
        g(i) = vals(i, c) - vals(i, 1)
        ord(i) = i
    Next i
    ' insertion sort: side (increase, decrease, unchanged), then |gap| descending
    Dim a As Long, b As Long, T As Long
    For a = 2 To m
        T = ord(a): b = a - 1
        Do While b >= 1
            If GapSide(g(ord(b))) > GapSide(g(T)) Or _
               (GapSide(g(ord(b))) = GapSide(g(T)) And Abs(g(ord(b))) < Abs(g(T))) Then
                ord(b + 1) = ord(b): b = b - 1
            Else
                Exit Do
            End If
        Loop
        ord(b + 1) = T
    Next a
    Dim cumP As Double, cumN As Double, r As Long, src As Long
    For r = 1 To m
        src = ord(r)
        If g(src) > 0 Then
            cumP = cumP + g(src)
            If totPos > 0 Then cumV(src, c) = cumP / totPos
        ElseIf g(src) < 0 Then
            cumN = cumN + Abs(g(src))
            If totNeg > 0 Then cumV(src, c) = cumN / totNeg
        End If
    Next r
End Sub

' Sort key for the two-sided Pareto: increases (0) first, then decreases (1),
' then unchanged (2). NB: a one-line If cannot carry ElseIf - must be a block If.
Private Function GapSide(ByVal g As Double) As Long
    If g > 0 Then
        GapSide = 0
    ElseIf g < 0 Then
        GapSide = 1
    Else
        GapSide = 2
    End If
End Function

'=============================== level / split maps ============================
' The analysis level dropdown (page 2) offers "5th" (the raw 5th column, shown
' first / default) plus the standard normalized level columns ("L1 Macro System"
' is the normalized Macro System; "Part Name" is "Normalized Part Name (EN)").
' Kept here so the form, charts and reports agree.
Public Function LevelNames() As Variant
    LevelNames = Array("5th", "L1 Macro System", "L2 System", "L3 Subsystem", "Part Name")
End Function

Public Function LevelCol(ByVal levelName As String) As Long
    Select Case LCase$(Trim$(levelName))
        Case "5th":          LevelCol = CB_FIFTH
        Case "macro system", "l1 macro system", "l1 domain": LevelCol = CB_L1
        Case "l2 system":    LevelCol = CB_L2
        Case "l3 subsystem": LevelCol = CB_L3
        Case "part name":    LevelCol = CB_NORMPART
        Case Else:           LevelCol = CB_L1
    End Select
End Function

' "Split Selection" (page 2) is a FILTER on the VALUES of the 5th column: the
' total bars are always split by 5th, and picking a value restricts the whole
' comparison (totals, steps, gap tables) to that split. Returns "(All)" + the
' distinct 5th values found in StackedCostbooks, sorted.
Public Function SplitValues() As Variant
    Dim d As Object: Set d = CreateObject("Scripting.Dictionary")
    d.CompareMode = vbTextCompare

    Dim lo As ListObject
    Set lo = FindTable("StackedCostbooks")
    If Not lo Is Nothing Then
        If Not lo.DataBodyRange Is Nothing Then
            Dim data As Variant, c As Long, i As Long, k As String
            c = SafeColIndex(lo, "5th")
            If c > 0 Then
                data = lo.DataBodyRange.Columns(c).value
                For i = 1 To UBound(data, 1)
                    k = Trim$(CStr(data(i, 1) & ""))
                    If Len(k) > 0 Then If Not d.Exists(k) Then d.Add k, True
                Next i
            End If
        End If
    End If

    Dim arr As Variant: arr = d.keys
    SortStrings arr
    Dim res() As Variant, n As Long
    ReDim res(0 To d.Count)
    res(0) = FILTER_ALL
    For n = 0 To d.Count - 1: res(n + 1) = arr(n): Next n
    SplitValues = res
End Function

' Rows of a GetCostbookRows array whose byCol matches value ("(blank)" matches
' empty cells; FILTER_ALL / "" returns the rows unchanged). value may pack SEVERAL
' values with FILTER_SEP - a row then passes when it matches any of them, which is
' how the page-2 "5th Split" filter keeps e.g. every 5th except "TC&Others".
' Empty when no match.
Public Function FilterRowsBy(ByRef rows As Variant, ByVal byCol As Long, _
                             ByVal value As String) As Variant
    If Not IsArray(rows) Then Exit Function
    If Len(value) = 0 Or value = FILTER_ALL Then
        FilterRowsBy = rows
        Exit Function
    End If
    Dim n As Long, i As Long, j As Long, k As String, cnt As Long
    n = UBound(rows, 1)
    Dim keep() As Long
    ReDim keep(1 To n)
    For i = 1 To n
        k = Trim$(CStr(rows(i, byCol) & ""))
        If Len(k) = 0 Then k = "(blank)"
        If FilterOk(k, value) Then                  ' single value or FILTER_SEP set
            cnt = cnt + 1: keep(cnt) = i
        End If
    Next i
    If cnt = 0 Then Exit Function
    Dim res() As Variant
    ReDim res(1 To cnt, 1 To CB_COLS)
    For i = 1 To cnt
        For j = 1 To CB_COLS: res(i, j) = rows(keep(i), j): Next j
    Next i
    FilterRowsBy = res
End Function

'=============================== data explorer =================================
' The Data Explorer page (page 3) lists one row per costbook record for database
' navigation + downloading the original file. It filters the SAME cached index by
' Region / Project / Milestone / Type / Platform / Powertrain / Carline Code and
' shows the columns in the EX_ layout. TPC is each costbook's OWN total (base
' currency), independent of the display-currency selector, so it always matches the
' Currency column. The Source File comes from the CostBookRecords table.

' Stable key of a costbook, matching the one built in LoadCostbookIndex / mTotals /
' LoadSourceFiles. Whitespace is normalised so a long free-text Vehicle Code still
' matches across tables despite stray double / non-breaking spaces or tabs.
Public Function CostbookKey(ByVal veh As String, ByVal ms As String, ByVal dateKey As String) As String
    CostbookKey = NormKeyText(veh) & "|" & NormKeyText(ms) & "|" & Trim$(dateKey)
End Function

Private Function NormKeyText(ByVal s As String) As String
    s = Replace(CStr(s), Chr$(160), " ")     ' non-breaking space -> space
    s = Replace(s, vbTab, " ")
    Do While InStr(s, "  ") > 0               ' collapse runs of spaces
        s = Replace(s, "  ", " ")
    Loop
    NormKeyText = Trim$(s)
End Function

' Raw Total TPC (base currency) of a costbook, from the index-time accumulation.
Public Function CostbookTotalFor(ByVal key As String) As Double
    If mTotals Is Nothing Then Exit Function
    If mTotals.Exists(key) Then CostbookTotalFor = CDbl(mTotals(key))
End Function

' Automatic Phase from the milestone: Serial Life / SOPM -> "Serial Life", else
' "Development".
Public Function PhaseOf(ByVal ms As String) As String
    Dim m As String: m = LCase$(Trim$(ms))
    If m = "serial life" Or m = "sopm" Then PhaseOf = "Serial Life" Else PhaseOf = "Development"
End Function

' Source file (display name + hyperlink) for an exact key, or Array("","") when none.
Public Function SourceFileFor(ByVal key As String) As Variant
    LoadSourceFiles
    If mSourceFiles.Exists(key) Then SourceFileFor = mSourceFiles(key) Else SourceFileFor = Array("", "")
End Function

' Source file for a costbook, tolerant of the fuzzy Milestone Date seen in the
' CostBookRecords data: try Vehicle|Milestone|Date, then Vehicle|Milestone, then
' Vehicle alone. Returns Array(displayName, url); Array("","") when nothing matches.
Public Function SourceFileForCostbook(ByVal veh As String, ByVal ms As String, _
        ByVal dateKey As String) As Variant
    LoadSourceFiles
    Dim k As String
    k = CostbookKey(veh, ms, dateKey)                         ' veh | milestone | date
    If mSourceFiles.Exists(k) Then SourceFileForCostbook = mSourceFiles(k): Exit Function
    k = NormKeyText(veh) & "|" & NormKeyText(ms)              ' veh | milestone
    If mSourceFiles.Exists(k) Then SourceFileForCostbook = mSourceFiles(k): Exit Function
    k = NormKeyText(veh)                                      ' veh only
    If mSourceFiles.Exists(k) Then SourceFileForCostbook = mSourceFiles(k): Exit Function
    SourceFileForCostbook = Array("", "")
End Function

' Builds mSourceFiles from the CostBookRecords table once per data refresh. Rows are
' keyed by Vehicle Code | Milestone | Milestone Date; the link is taken from the
' first present of several likely column names (real cell Hyperlink preferred over a
' plain URL string), the display name from a name column or the file name in the URL.
Private Sub LoadSourceFiles()
    If mSourceLoaded Then Exit Sub
    Set mSourceFiles = CreateObject("Scripting.Dictionary")
    mSourceFiles.CompareMode = vbTextCompare
    mSourceLoaded = True

    Dim lo As ListObject
    Set lo = FindTable("CostBookRecords")
    If lo Is Nothing Then                         ' table not named -> first table on the sheet
        On Error Resume Next
        Set lo = ThisWorkbook.Worksheets("CostBookRecords").ListObjects(1)
        On Error GoTo 0
    End If
    If lo Is Nothing Then Exit Sub
    If lo.DataBodyRange Is Nothing Then Exit Sub

    Dim cVeh As Long, cMs As Long, cDt As Long, cUrl As Long, cName As Long
    cVeh = SafeColIndex(lo, "Vehicle Code")
    cMs = SafeColIndex(lo, "Milestone")
    cDt = SafeColIndex(lo, "Milestone Date")
    cUrl = FirstColIndex(lo, Array("Source File", "File URL", "URL", "Url", "Link", "SharePoint", "Hyperlink", "Path", "File"))
    cName = FirstColIndex(lo, Array("File Name", "FileName", "Name", "Source File", "File"))
    If cVeh = 0 Or cMs = 0 Or cDt = 0 Then Exit Sub

    Dim body As Range: Set body = lo.DataBodyRange
    Dim r As Long, veh As String, ms As String, dk As String, key As String
    Dim url As String, nm As String, cell As Range
    For r = 1 To body.rows.Count
        veh = Trim$(CStr(body.Cells(r, cVeh).value))
        If Len(veh) > 0 Then
            ms = Trim$(CStr(body.Cells(r, cMs).value))
            dk = DateKeyOf(body.Cells(r, cDt).value)
            key = CostbookKey(veh, ms, dk)
            url = "": nm = ""
            If cUrl > 0 Then
                Set cell = body.Cells(r, cUrl)
                If cell.Hyperlinks.Count > 0 Then url = cell.Hyperlinks(1).Address
                If Len(url) = 0 Then url = Trim$(CStr(cell.value))
            End If
            If cName > 0 Then nm = Trim$(CStr(body.Cells(r, cName).value))
            ' when the name cell just holds the raw URL (no friendly text), show a
            ' clean file name derived from the link instead of the whole URL
            If Len(nm) = 0 Or StrComp(nm, url, vbTextCompare) = 0 Then nm = FileNameFromUrl(url)
            If Len(nm) = 0 And Len(url) > 0 Then nm = "Open file"
            ' index under the full key AND fallbacks (veh|ms, veh) so a fuzzy
            ' Milestone Date can't stop the join - first row wins on a fallback key
            Dim entry As Variant: entry = Array(nm, url)
            AddKeyIfNew mSourceFiles, key, entry
            AddKeyIfNew mSourceFiles, NormKeyText(veh) & "|" & NormKeyText(ms), entry
            AddKeyIfNew mSourceFiles, NormKeyText(veh), entry
        End If
    Next r
End Sub

Private Sub AddKeyIfNew(ByVal d As Object, ByVal k As String, ByVal v As Variant)
    If Len(k) > 0 Then If Not d.Exists(k) Then d.Add k, v
End Sub

' Index of the first of names present in lo (0 when none).
Private Function FirstColIndex(ByVal lo As ListObject, ByVal names As Variant) As Long
    Dim i As Long, c As Long
    For i = LBound(names) To UBound(names)
        c = SafeColIndex(lo, CStr(names(i)))
        If c > 0 Then FirstColIndex = c: Exit Function
    Next i
End Function

' Best-effort file name from a URL / path (after the last / or \, %20 -> space).
Private Function FileNameFromUrl(ByVal url As String) As String
    Dim s As String: s = Trim$(url)
    If Len(s) = 0 Then Exit Function
    Dim q As Long: q = InStr(s, "?")
    If q > 0 Then s = Left$(s, q - 1)
    Dim p As Long, pb As Long
    p = InStrRev(s, "/"): pb = InStrRev(s, "\")
    If pb > p Then p = pb
    If p > 0 Then s = Mid$(s, p + 1)
    FileNameFromUrl = Replace(s, "%20", " ")
End Function

' The 7 explorer filter columns (0-based Array), aligned to the filters array the
' form passes to ExplorerDistinct / ExplorerData.
Public Function ExplorerFilterCols() As Variant
    ExplorerFilterCols = Array(CI_REGION, CI_PROJECT, CI_MILESTONE, CI_TYPE, _
                               CI_PLATFORM, CI_PTRAIN, CI_VEHICLE)
End Function

' True when index row i passes every explorer filter EXCEPT the one on exceptCol
' (pass 0 to apply them all). filters is aligned to ExplorerFilterCols().
Private Function ExplorerRowPasses(ByRef idx As Variant, ByVal i As Long, ByRef cols As Variant, _
        ByRef filters As Variant, ByVal exceptCol As Long) As Boolean
    Dim j As Long, col As Long
    For j = LBound(cols) To UBound(cols)
        col = CLng(cols(j))
        If col <> exceptCol Then
            If Not FilterOk(idx(i, col), CStr(filters(j))) Then Exit Function
        End If
    Next j
    ExplorerRowPasses = True
End Function

' Distinct values of one explorer filter column among costbooks passing the OTHER
' filters (cascading), sorted, prefixed with "(All)".
Public Function ExplorerDistinct(ByVal attrCol As Long, ByVal filters As Variant) As Variant
    Dim idx As Variant: idx = CostbookIndex()
    Dim cols As Variant: cols = ExplorerFilterCols()
    Dim d As Object: Set d = CreateObject("Scripting.Dictionary")
    d.CompareMode = vbTextCompare
    Dim i As Long, k As String
    If IsArray(idx) Then
        For i = 1 To UBound(idx, 1)
            If ExplorerRowPasses(idx, i, cols, filters, attrCol) Then
                k = Trim$(CStr(idx(i, attrCol)))
                If Len(k) > 0 And k <> "?" Then If Not d.Exists(k) Then d.Add k, True
            End If
        Next i
    End If
    Dim arr As Variant: arr = d.keys
    ' same lifecycle order as the page-1/2 milestone filter, not alphabetical
    If attrCol = CI_MILESTONE Then SortMilestones arr Else SortStrings arr
    Dim res() As Variant, n As Long
    ReDim res(0 To d.Count)
    res(0) = FILTER_ALL
    For n = 0 To d.Count - 1: res(n + 1) = arr(n): Next n
    ExplorerDistinct = res
End Function

' The Data Explorer table: one row per costbook passing ALL filters, in the EX_
' column layout, sorted by Carline Code then Milestone Date. Empty when none match.
Public Function ExplorerData(ByVal filters As Variant) As Variant
    Dim idx As Variant: idx = CostbookIndex()
    If Not IsArray(idx) Then Exit Function
    Dim cols As Variant: cols = ExplorerFilterCols()

    Dim keep() As Long, n As Long, i As Long
    ReDim keep(1 To UBound(idx, 1))
    For i = 1 To UBound(idx, 1)
        If ExplorerRowPasses(idx, i, cols, filters, 0) Then n = n + 1: keep(n) = i
    Next i
    If n = 0 Then Exit Function

    ' insertion-sort kept rows by Carline Code, then Milestone Date
    Dim a As Long, b As Long, T As Long
    For a = 2 To n
        T = keep(a): b = a - 1
        Do While b >= 1
            If CompareCarline(idx, keep(b), T) > 0 Then
                keep(b + 1) = keep(b): b = b - 1
            Else
                Exit Do
            End If
        Loop
        keep(b + 1) = T
    Next a

    Dim res() As Variant, rr As Long, key As String, sf As Variant
    ReDim res(1 To n, 1 To EX_COLS)
    For i = 1 To n
        rr = keep(i)
        key = CostbookKey(CStr(idx(rr, CI_VEHICLE)), CStr(idx(rr, CI_MILESTONE)), CStr(idx(rr, CI_DATEKEY)))
        res(i, EX_REGION) = idx(rr, CI_REGION)
        res(i, EX_PROJECT) = idx(rr, CI_PROJECT)
        res(i, EX_PROGRAM) = idx(rr, CI_PROGRAM)
        res(i, EX_CARLINE) = idx(rr, CI_VEHICLE)
        res(i, EX_MILESTONE) = idx(rr, CI_MILESTONE)
        res(i, EX_MSDATE) = idx(rr, CI_DATEKEY)
        res(i, EX_PHASE) = PhaseOf(CStr(idx(rr, CI_MILESTONE)))
        res(i, EX_CURRENCY) = idx(rr, CI_CURRENCY)
        res(i, EX_TPC) = CostbookTotalFor(key)
        res(i, EX_PLATFORM) = idx(rr, CI_PLATFORM)
        res(i, EX_PTRAIN) = idx(rr, CI_PTRAIN)
        res(i, EX_PCP) = idx(rr, CI_PCP)
        res(i, EX_REFPERSON) = idx(rr, CI_REFPERSON)
        sf = SourceFileForCostbook(CStr(idx(rr, CI_VEHICLE)), CStr(idx(rr, CI_MILESTONE)), CStr(idx(rr, CI_DATEKEY)))
        res(i, EX_SOURCE) = sf(0)
        res(i, EX_URL) = sf(1)
    Next i
    ExplorerData = res
End Function

Private Function CompareCarline(ByRef idx As Variant, ByVal r1 As Long, ByVal r2 As Long) As Long
    CompareCarline = StrComp(CStr(idx(r1, CI_VEHICLE)), CStr(idx(r2, CI_VEHICLE)), vbTextCompare)
    If CompareCarline = 0 Then _
        CompareCarline = StrComp(CStr(idx(r1, CI_DATEKEY)), CStr(idx(r2, CI_DATEKEY)), vbTextCompare)
End Function

' Diagnostic - run it (F5 inside the sub, or type DiagnoseSourceFiles in the
' Immediate window) to see WHY Data Explorer Source File links do / don't resolve.
' Full detail prints to the Immediate window (Ctrl+G in the VBE).
Public Sub DiagnoseSourceFiles()
    Debug.Print String$(66, "=")
    Debug.Print "CostBookRecords source-file diagnostic  -  " & Now

    Dim lo As ListObject
    Set lo = FindTable("CostBookRecords")
    If lo Is Nothing Then
        On Error Resume Next
        Set lo = ThisWorkbook.Worksheets("CostBookRecords").ListObjects(1)
        On Error GoTo 0
    End If
    If lo Is Nothing Then
        Debug.Print "TABLE NOT FOUND: no ListObject named 'CostBookRecords', and no sheet"
        Debug.Print "named 'CostBookRecords' that holds a table."
        MsgBox "CostBookRecords table not found - see the Immediate window (Ctrl+G).", vbExclamation
        Exit Sub
    End If
    Debug.Print "Table '" & lo.name & "' on sheet '" & lo.parent.name & "', data rows = " & _
                IIf(lo.DataBodyRange Is Nothing, 0, lo.DataBodyRange.rows.Count)

    Dim hc As ListColumn, hdrs As String
    For Each hc In lo.ListColumns: hdrs = hdrs & "[" & hc.name & "] ": Next hc
    Debug.Print "Headers present: " & hdrs
    Debug.Print "Required cols (0 = MISSING): Vehicle Code=" & SafeColIndex(lo, "Vehicle Code") & _
                ", Milestone=" & SafeColIndex(lo, "Milestone") & _
                ", Milestone Date=" & SafeColIndex(lo, "Milestone Date") & _
                ", Source File=" & SafeColIndex(lo, "Source File")

    LoadCostbookIndex                      ' rebuild caches
    mSourceLoaded = False
    Dim ignore As Variant: ignore = SourceFileFor("~forceload~")
    Debug.Print "Source-file keys (full + veh|ms + veh fallbacks): " & _
                IIf(mSourceFiles Is Nothing, 0, mSourceFiles.Count)

    Debug.Print "-- sample CostBookRecords keys (links stored under these) --"
    Dim k As Variant, i As Long, vv As Variant
    If Not mSourceFiles Is Nothing Then
        For Each k In mSourceFiles.keys
            vv = mSourceFiles(k)
            Debug.Print "   {" & k & "}  name=" & CStr(vv(0)) & "  hasUrl=" & (Len(CStr(vv(1))) > 0)
            i = i + 1: If i >= 6 Then Exit For
        Next k
    End If

    Debug.Print "-- sample costbook keys (Explorer looks up these) + match result --"
    Dim idx As Variant: idx = CostbookIndex()
    Dim matched As Long, total As Long, key As String, sf As Variant
    If IsArray(idx) Then
        total = UBound(idx, 1)
        For i = 1 To total
            key = CostbookKey(CStr(idx(i, CI_VEHICLE)), CStr(idx(i, CI_MILESTONE)), CStr(idx(i, CI_DATEKEY)))
            sf = SourceFileForCostbook(CStr(idx(i, CI_VEHICLE)), CStr(idx(i, CI_MILESTONE)), CStr(idx(i, CI_DATEKEY)))
            If Len(CStr(sf(1))) > 0 Then matched = matched + 1
            If i <= 6 Then Debug.Print "   {" & key & "}  -> " & _
                IIf(Len(CStr(sf(1))) > 0, "MATCH: " & CStr(sf(0)), "no match")
        Next i
    End If
    Debug.Print "MATCHED " & matched & " of " & total & " costbooks."
    Debug.Print String$(66, "=")

    MsgBox "Matched " & matched & " of " & total & " costbooks to a Source File." & vbCrLf & vbCrLf & _
           "Full detail is in the Immediate window (Ctrl+G). Compare the two sets of" & vbCrLf & _
           "keys: Vehicle Code | Milestone | Milestone Date must be IDENTICAL on both sides.", _
           vbInformation, "Source file diagnostic"
End Sub

'=============================== sorting helpers ===============================
Private Sub SortStrings(ByRef arr As Variant)
    Dim i As Long, j As Long, T As Variant
    On Error Resume Next
    If UBound(arr) < LBound(arr) Then Exit Sub
    On Error GoTo 0
    For i = LBound(arr) + 1 To UBound(arr)
        T = arr(i): j = i - 1
        Do While j >= LBound(arr)
            If StrComp(CStr(arr(j)), CStr(T), vbTextCompare) > 0 Then
                arr(j + 1) = arr(j): j = j - 1
            Else
                Exit Do
            End If
        Loop
        arr(j + 1) = T
    Next i
End Sub

' Sorts labels() and vals() together by vals descending (insertion sort).
Private Sub SortByValueDesc(ByRef labels As Variant, ByRef vals() As Double)
    Dim i As Long, j As Long, tv As Double, tl As Variant
    For i = LBound(vals) + 1 To UBound(vals)
        tv = vals(i): tl = labels(i): j = i - 1
        Do While j >= LBound(vals)
            If vals(j) < tv Then
                vals(j + 1) = vals(j): labels(j + 1) = labels(j): j = j - 1
            Else
                Exit Do
            End If
        Loop
        vals(j + 1) = tv: labels(j + 1) = tl
    Next i
End Sub

