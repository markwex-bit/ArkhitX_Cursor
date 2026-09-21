Attribute VB_Name = "modOnboarding"
'==================================================================================
' modOnboarding  -  Builds a branded "Home" onboarding sheet for tool users, with a
' single green button that opens the report view (ShowCostbooksSynthesis).
'
'   Run BuildOnboardingSheet once to create / refresh the "Home" sheet (it is moved
'   to the front of the workbook). The whole page is drawn as native shapes, so it
'   survives row/column edits and needs no images or references.
'
' Tip: to land users here on open, add to ThisWorkbook:
'     Private Sub Workbook_Open(): modOnboarding.ShowHome: End Sub
'==================================================================================
Option Explicit

' Office shape enum values (declared locally so no Office reference is needed)
Private Const msoShapeRectangle As Long = 1
Private Const msoShapeRoundedRectangle As Long = 5
Private Const msoTextOrientationHorizontal As Long = 1
Private Const msoFalse As Long = 0
Private Const msoTrue As Long = -1
Private Const msoAlignLeft As Long = 1
Private Const msoAlignCenter As Long = 2
Private Const msoAnchorTop As Long = 1
Private Const msoAnchorMiddle As Long = 3

Private Const SHEET_NAME As String = "Home"

Private Function NAVY() As Long:     NAVY = RGB(31, 47, 105):    End Function
Private Function Green() As Long:    Green = RGB(46, 155, 71):   End Function
Private Function GrayTx() As Long:   GrayTx = RGB(90, 100, 120): End Function
Private Function CardFill() As Long: CardFill = RGB(246, 248, 252): End Function
Private Function CardLine() As Long: CardLine = RGB(206, 216, 232): End Function

'============================== entry points ==================================
' Builds (or rebuilds) the Home sheet and activates it.
Public Sub BuildOnboardingSheet()
    Dim ws As Worksheet
    Set ws = GetOrCreateSheet(SHEET_NAME)

    Application.ScreenUpdating = False
    ClearSheet ws
    ws.Cells.font.name = "Segoe UI"
    ws.Cells.Interior.color = vbWhite
    ws.Columns("A").ColumnWidth = 2

    '---- header band + badge + title -----------------------------------------
    Dim hdr As Shape
    Set hdr = ws.Shapes.AddShape(msoShapeRoundedRectangle, 30, 24, 780, 96)
    hdr.Fill.ForeColor.RGB = NAVY()
    hdr.Line.Visible = msoFalse
    hdr.Adjustments(1) = 0.06
    hdr.name = "onbHeader"

    Dim badge As Shape
    Set badge = ws.Shapes.AddShape(msoShapeRoundedRectangle, 46, 42, 60, 60)
    badge.Fill.ForeColor.RGB = vbWhite
    badge.Line.Visible = msoFalse
    badge.Adjustments(1) = 0.25
    SetText badge, "TPC", 18, True, NAVY(), msoAlignCenter, msoAnchorMiddle

    AddText ws, 122, 40, 670, 34, "Comparison & Synthesis Generator", 22, True, vbWhite
    AddText ws, 122, 76, 670, 24, _
        "Analyse & compare costbook TPC, and browse/download the source costbooks", 11.5, False, RGB(210, 218, 235)

    '---- intro + the one button ----------------------------------------------
    AddText ws, 30, 134, 780, 40, _
        "Welcome. Open the tool to filter your costbooks, preview the charts, compare " & _
        "carlines and browse the database (with one-click download of the originals) - " & _
        "all without leaving Excel.", 12, False, GrayTx()

    Dim btn As Shape
    Set btn = ws.Shapes.AddShape(msoShapeRoundedRectangle, 30, 184, 300, 60)
    btn.Fill.ForeColor.RGB = Green()
    btn.Line.Visible = msoFalse
    btn.Adjustments(1) = 0.16
    SetText btn, ChrW(9658) & "   Open the Report View", 15, True, vbWhite, msoAlignCenter, msoAnchorMiddle
    btn.OnAction = "ShowCostbooksSynthesis"
    btn.name = "btnOpenTool"

    AddText ws, 348, 190, 462, 48, _
        "Opens the 3-page tool. It stays open (modeless), so you can browse the " & _
        "report sheets it generates while it is still open.", 11, False, GrayTx()

    '---- three info cards -----------------------------------------------------
    AddCard ws, 30, 276, 250, 176, "Page 1  -  Cost Analysis", _
        ChrW(8226) & " Filter by Region / Type / Platform / Powertrain" & vbLf & _
        ChrW(8226) & " One costbook: TPC bar chart, 5th-split pie, Top 10 drivers" & vbLf & _
        ChrW(8226) & " Export a 4-sheet Costbook Report"

    AddCard ws, 290, 276, 250, 176, "Page 2  -  Comparison", _
        ChrW(8226) & " Compare up to 5 costbooks (Baseline first)" & vbLf & _
        ChrW(8226) & " TPC-walk waterfall + per-vehicle gap tables (Pareto)" & vbLf & _
        ChrW(8226) & " Export a 4-sheet Gap Comparison Report"

    AddCard ws, 550, 276, 250, 176, "Page 3  -  Data Explorer", _
        ChrW(8226) & " Browse records; filter by Region / Project / Milestone / etc." & vbLf & _
        ChrW(8226) & " Phase, Currency, Total TPC, PCP team, reference person" & vbLf & _
        ChrW(8226) & " Open / download the original costbook + export the list"

    '---- quick-start strip + footer ------------------------------------------
    AddText ws, 30, 470, 780, 24, _
        "Quick start:   1) Open the Report View     2) Filter & select     3) Analyse, export or download", _
        12, True, NAVY()

    AddText ws, 30, 502, 780, 40, _
        "Data: tables ""StackedCostbooks"", ""CarlinesDefinition"", ""ExchangeRates"" " & _
        "(currency) and ""CostBookRecords"" (source files).   " & _
        "Reports open as new, unsaved workbooks; save them where you like.", 10, False, RGB(150, 150, 150)

    ws.Range("A1").Select
    ShowHome
    Application.ScreenUpdating = True
End Sub

' Activates the Home sheet with a clean, chrome-free view.
Public Sub ShowHome()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(SHEET_NAME)
    On Error GoTo 0
    If ws Is Nothing Then BuildOnboardingSheet: Exit Sub
    ws.Activate
    On Error Resume Next
    ActiveWindow.DisplayGridlines = False
    ActiveWindow.DisplayHeadings = False
    On Error GoTo 0
End Sub

'================================ helpers =====================================
Private Function GetOrCreateSheet(ByVal nm As String) As Worksheet
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(nm)
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add(before:=ThisWorkbook.Worksheets(1))
        ws.name = nm
    Else
        ws.Move before:=ThisWorkbook.Worksheets(1)
    End If
    Set GetOrCreateSheet = ws
End Function

Private Sub ClearSheet(ByVal ws As Worksheet)
    Dim i As Long
    On Error Resume Next
    For i = ws.Shapes.Count To 1 Step -1
        ws.Shapes(i).Delete
    Next i
    ws.Cells.Clear
    On Error GoTo 0
End Sub

' Transparent, borderless text box (heading / body copy).
Private Function AddText(ByVal ws As Worksheet, ByVal x As Single, ByVal y As Single, _
        ByVal W As Single, ByVal H As Single, ByVal txt As String, ByVal sizePt As Single, _
        ByVal bold As Boolean, ByVal colr As Long) As Shape
    Dim s As Shape
    Set s = ws.Shapes.AddTextbox(msoTextOrientationHorizontal, x, y, W, H)
    s.Fill.Visible = msoFalse
    s.Line.Visible = msoFalse
    SetText s, txt, sizePt, bold, colr, msoAlignLeft, msoAnchorTop
    Set AddText = s
End Function

' A titled "card" panel with a bullet body.
Private Sub AddCard(ByVal ws As Worksheet, ByVal x As Single, ByVal y As Single, _
        ByVal W As Single, ByVal H As Single, ByVal Title As String, ByVal body As String)
    Dim p As Shape
    Set p = ws.Shapes.AddShape(msoShapeRoundedRectangle, x, y, W, H)
    p.Fill.ForeColor.RGB = CardFill()
    p.Line.ForeColor.RGB = CardLine()
    p.Line.Weight = 0.75
    p.Adjustments(1) = 0.05
    AddText ws, x + 18, y + 16, W - 36, 24, Title, 13, True, NAVY()
    Dim b As Shape
    Set b = AddText(ws, x + 18, y + 48, W - 36, H - 62, body, 11, False, GrayTx())
    b.TextFrame2.TextRange.ParagraphFormat.SpaceWithin = 1.1
End Sub

' Sets a shape's caption + font in one call.
Private Sub SetText(ByVal s As Shape, ByVal txt As String, ByVal sizePt As Single, _
        ByVal bold As Boolean, ByVal colr As Long, ByVal align As Long, _
        Optional ByVal vAnchor As Long = 1)
    With s.TextFrame2
        .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
        .WordWrap = msoTrue
        .VerticalAnchor = vAnchor
        With .TextRange
            .text = txt
            .font.name = "Segoe UI"
            .font.Size = sizePt
            .font.bold = IIf(bold, msoTrue, msoFalse)
            .font.Fill.ForeColor.RGB = colr
            .ParagraphFormat.Alignment = align
        End With
    End With
End Sub

