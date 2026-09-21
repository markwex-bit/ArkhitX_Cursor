Attribute VB_Name = "frmCostbooks"
Attribute VB_Base = "0{6724709A-C991-4EAC-B4A6-DCFEA426CD80}{D172E068-CE1D-4255-BBCC-35CD92A9BC07}"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Attribute VB_TemplateDerived = False
Attribute VB_Customizable = False
'==================================================================================
' frmCostbooks  -  Comparison & Synthesis Generator (2-page form, built 100% in code)
'
' *** SETUP (this file is NOT importable - the layout is code-built): ***
'   1. VBA IDE -> Insert -> UserForm; set (Name) = frmCostbooks  (leave it empty).
'   2. View Code (F7) and paste this WHOLE file in.
'   3. Same for the export popup: Insert -> UserForm, (Name) = frmGapExport,
'      paste frmGapExport.txt in. (modUpdateModules does both automatically.)
'   4. Import the companion modules/classes from src\ (File -> Import File...):
'        modCostbookApp, modCostbookData, modCostbookCharts, modCostbookReport,
'        modColorUtil, modChartUtil, modGdiPlus, modPastePicture, modMouseWheel,
'        IChartSurface, clsShapeSurface, clsGdiSurface, clsCatModel,
'        clsBarsRenderer, clsPieRenderer, clsWaterfallModel, clsWaterfallRenderer,
'        clsMultiFilter
'   5. Assign ShowCostbooksSynthesis (modCostbookApp) to a worksheet button.
'
' Layout: fixed navy header (title + page tabs + the export button) and a fixed
' status row; everything else lives in a vertically scrollable body frame so each
' chart can take the full width and (nearly) the full height of the window.
'
' Filters: Region / Type / Platform / Powertrain / Milestone, the page-2 5th Split
' and the 7 Data Explorer filters are Power BI style MULTI-select (clsMultiFilter): a
' combo-looking box dropping a searchable checkbox list, nothing checked = "(All)",
' several checked = OR. On the 5th Split that also buys exclusion - "Select all"
' then untick one 5th (e.g. TC&Others) to compare everything but that one.
' Analysis Level, Currency and the costbook / carline pickers stay single-select
' (each feeds one scalar into the renderers and the report sheets).
'
' Page 1 "Cost Analysis":  filters -> one costbook -> cost bars + pie +
'                          Top 10 Systems / Top 10 Parts. "Export Costbook
'                          Report" writes the 4-sheet report workbook.
' Page 2 "Comparative Analysis": up to 3 costbooks -> waterfall + gap lists,
'                          Analysis Level / 5th Split selections. "Export Gap
'                          Report..." opens frmGapExport (pick up to 5 carlines)
'                          and writes the 4-sheet Gap Comparison workbook.
'==================================================================================
Option Explicit

'---------------------------------- palette ------------------------------------
Private Const NAVY As Long = 6893343        ' RGB(31, 47, 105)
Private Const GRAYTXT As Long = 9868950     ' RGB(150,150,150)
Private Const CARD_FILL As Long = 16578550  ' RGB(246,248,252)
Private Const CARD_LINE As Long = 14795700  ' RGB(180,195,225)
Private Const PREV_LINE As Long = 14602440  ' RGB(200,208,222)
Private Const EXPORT_W As Single = 1000     ' widthPt used when building a chart for PNG export (crisp raster)

'--------------------------- multi-select filters ------------------------------
' Power BI style: a combo-looking box that drops a checkbox list (clsMultiFilter).
' Nothing checked = "(All)". They call back into MultiFilterChanged when closed.
Private mfRegion As clsMultiFilter
Private mfType As clsMultiFilter
Private mfPlatform As clsMultiFilter
Private mfPtrain As clsMultiFilter
Private mfMilestone As clsMultiFilter  ' lifecycle milestone (IM..Serial Life), Config order
Private mfSplit As clsMultiFilter    ' page-2 "5th Split" (several 5ths, or all but one)

'------------------------------ event controls ---------------------------------
Private WithEvents cboCostbook As MSForms.ComboBox
Attribute cboCostbook.VB_VarHelpID = -1
Private WithEvents cboCar1 As MSForms.ComboBox
Attribute cboCar1.VB_VarHelpID = -1
Private WithEvents cboCar2 As MSForms.ComboBox
Attribute cboCar2.VB_VarHelpID = -1
Private WithEvents cboCar3 As MSForms.ComboBox
Attribute cboCar3.VB_VarHelpID = -1
Private WithEvents cboLevel As MSForms.ComboBox
Attribute cboLevel.VB_VarHelpID = -1
Private WithEvents cboCurrency As MSForms.ComboBox   ' global display-currency selector
Attribute cboCurrency.VB_VarHelpID = -1
Private WithEvents btnPage1 As MSForms.CommandButton
Attribute btnPage1.VB_VarHelpID = -1
Private WithEvents btnPage2 As MSForms.CommandButton
Attribute btnPage2.VB_VarHelpID = -1
Private WithEvents btnPage3 As MSForms.CommandButton
Attribute btnPage3.VB_VarHelpID = -1
Private WithEvents btnExtract As MSForms.CommandButton
Attribute btnExtract.VB_VarHelpID = -1
Private WithEvents btnClearFilters As MSForms.CommandButton
Attribute btnClearFilters.VB_VarHelpID = -1
Private WithEvents btnClose As MSForms.CommandButton
Attribute btnClose.VB_VarHelpID = -1
Private WithEvents btnPngBars As MSForms.CommandButton     ' per-chart PNG export
Attribute btnPngBars.VB_VarHelpID = -1
Private WithEvents btnPngPie As MSForms.CommandButton
Attribute btnPngPie.VB_VarHelpID = -1
Private WithEvents btnPngWater As MSForms.CommandButton
Attribute btnPngWater.VB_VarHelpID = -1

'---- Data Explorer (page 3) ---------------------------------------------------
Private mfExRegion As clsMultiFilter
Private mfExProject As clsMultiFilter
Private mfExMilestone As clsMultiFilter
Private mfExType As clsMultiFilter
Private mfExPlatform As clsMultiFilter
Private mfExPtrain As clsMultiFilter
Private mfExCarline As clsMultiFilter
Private WithEvents btnExClear As MSForms.CommandButton
Attribute btnExClear.VB_VarHelpID = -1
Private WithEvents btnOpenSource As MSForms.CommandButton
Attribute btnOpenSource.VB_VarHelpID = -1
Private WithEvents lstExplorer As MSForms.ListBox
Attribute lstExplorer.VB_VarHelpID = -1

'------------------------------ passive controls -------------------------------
Private fraBody As MSForms.Frame     ' scrollable page body (between header & status)
Private imgBars As MSForms.image
Private imgPie As MSForms.image
Private imgWaterfall As MSForms.image
Private lblBarsPh As MSForms.label
Private lblPiePh As MSForms.label
Private lblWaterPh As MSForms.label
Private lstSystems As MSForms.ListBox
Private lstParts As MSForms.ListBox
Private lstGapSplit As MSForms.ListBox
Private lstGapTop As MSForms.ListBox
Private lblStatus As MSForms.label
Private lblGapSplitTitle As MSForms.label
Private lblGapTopTitle As MSForms.label

'---------------------------------- state --------------------------------------
Private mLoading As Boolean          ' guard: True while lists are mutated in code
Private mPage As Long                ' 1 = Cost Analysis, 2 = Comparative Analysis
Private mCostbooks As Variant        ' FilteredCostbooks result backing the combos
Private mPage1Ctls As Collection     ' controls only visible on page 1
Private mPage2Ctls As Collection     ' controls only visible on page 2
Private mPage3Ctls As Collection     ' controls only visible on page 3 (Data Explorer)
Private mSharedP12Ctls As Collection ' filter card shared by pages 1 & 2 (hidden on page 3)
Private mScrollH1 As Single          ' body ScrollHeight for page 1
Private mScrollH2 As Single          ' body ScrollHeight for page 2
Private mScrollH3 As Single          ' body ScrollHeight for page 3
Private mKeyP1 As String             ' last rendered page-1 selection (skip no-op renders)
Private mKeyP2 As String             ' last rendered page-2 selection
Private mKeyP3 As String             ' last rendered page-3 filter set
Private mExUrls() As String          ' source-file URLs aligned to lstExplorer rows
Private mExData As Variant           ' current ExplorerData array (backs the list + export)
' Guard: a render / export is running. ShowPreview and the export handlers call
' DoEvents, which lets a queued click (a filter popup's scrim closes on mouse-DOWN,
' so one is very often pending) fire a SECOND render on top of the first. Both
' would then drive the SAME scratch sheet: the inner EndTemp deletes the shapes the
' outer render is still grouping and re-hides the sheet under it, which leaves
' Excel churning on dead Shape objects with the clipboard half-owned - the state
' where the pointer spins and report windows refuse to close.
' Never assigned directly - go through the mBusy property below.
Private mBusyFlag As Boolean

' Set when the user asks to close (Close button or the title-bar X) while mBusy is
' True. The close is then DEFERRED to the end of the running render instead of being
' honoured on the spot.
'
' Why it must be deferred: ShowPreview calls DoEvents, so a queued click on Close is
' dispatched from INSIDE the render. Unloading there tore the form down with
' RefreshPage1 still on the stack - so its CleanUp block never ran, EndTemp never
' deleted the scratch shapes, and Excel was left publishing a delayed-render picture
' promise pointing at shapes on a sheet nothing would ever tidy. That is the minimum
' repro for the workbook-close hang: render, click Close while it is still drawing,
' then close any workbook.
Private mCloseRequested As Boolean

'================================ lifecycle ====================================
' mBusy is a property rather than a plain field for one reason: the wheel subclass
' must go inert for exactly the span a render owns the form. Routing every existing
' "mBusy = ..." assignment through here means no render site has to remember to do
' it, and none can drift out of step later.
Private Property Let mBusy(ByVal b As Boolean)
    mBusyFlag = b
    On Error Resume Next
    modMouseWheel.Enabled = Not b
    On Error GoTo 0
End Property

Private Property Get mBusy() As Boolean
    mBusy = mBusyFlag
End Property

Private Sub UserForm_Initialize()
    Dim L As Single, T As Single, W As Single, H As Single
    GetWorkAreaPt L, T, W, H
    If W < 300 Or H < 300 Then L = 40: T = 30: W = 1100: H = 680
    Me.StartUpPosition = 0
    Me.Left = L: Me.top = T: Me.width = W: Me.Height = H
    Me.caption = "Comparison & Synthesis Generator"
    Me.BackColor = vbWhite

    ' BuildUI used to run bare. Anything failing inside it (a missing helper after a
    ' partial module refresh, a duplicate control name, a bad Controls.Add) left the
    ' form on screen half-built - typically blank white with nothing but the body
    ' frame's scrollbar - and no clue as to why. Say what broke instead.
    On Error GoTo BuildFail
    BuildUI
    On Error GoTo DataFail
    LoadCostbookIndex          ' refresh the cached data on every open
    LoadLists
    On Error GoTo 0
    SwitchPage 1
    Exit Sub
DataFail:
    mLoading = False
    SwitchPage 1
    SetStatus "Data error: " & Err.Description
    Exit Sub
BuildFail:
    MsgBox "The dashboard could not build its layout, so the form is empty." & vbCrLf & vbCrLf & _
           "Error " & Err.Number & " - " & Err.Description & vbCrLf & vbCrLf & _
           "If this followed a module refresh: RefreshModulesFromFolder deliberately " & _
           "SKIPS modules holding API Declare statements (modMouseWheel, modPastePicture, " & _
           "modGdiPlus, modCostbookApp). Remove and re-import those by hand in the VBE, " & _
           "then Debug > Compile.", vbExclamation, "Comparison & Synthesis Generator"
End Sub

' Re-arm combo events after another app stole focus (known MSForms quirk), and arm
' wheel scrolling.
'
' *** STILL NO GLOBAL MOUSE HOOK HERE - AND DO NOT PUT ONE BACK. ***
' The body frame used to be wheel-scrollable through a Windows mouse hook
' (WH_MOUSE_LL, then WH_MOUSE). Both forms of it were a permanent source of hangs
' and crashes, because the hook procedure is VBA code that Windows calls on every
' mouse message on the same thread VBA itself runs on:
'   - it fired mid-render (ShowPreview's DoEvents activates the form), leaving the
'     dashboard blank with Excel spinning inside the hook proc;
'   - duplicate hooks chained into each other and looped forever;
'   - and any VBA Stop/Reset while the form was open orphaned a live hook pointing
'     at unloaded code, which takes Excel down with it on the next mouse move.
'
' modMouseWheel now does it the way that old comment said it would have to be done:
' a SUBCLASS OF THIS FORM'S OWN WINDOW, taking WM_MOUSEWHEEL and nothing else. No
' other window in Excel routes through VBA, HookWheel refuses to chain a second
' subclass (this handler runs again on every re-activation), and the wheel goes
' inert during a render - which answers all three failures above. The one they
' still share is Stop/Reset while the form is open; read modMouseWheel's header.
'
' HookWheel is armed here rather than in Initialize because the window does not
' exist until the form is shown.
' *** THE WHEEL IS OFF FOR THE WHOLE OF THIS HANDLER, AND THAT IS DELIBERATE. ***
' Returning from another application (Alt-Tab back from an editor, say) re-activates
' the form, and MSForms PUMPS MESSAGES during activation and during SetFocus. A wheel
' notch dispatched inside that window would ask VBA to run the subclass's procedure
' while this handler is still on the stack - VBA cannot re-enter itself across two
' procedures any more than it can within one, and it stalls exactly as it does on a
' nested wheel message. modMouseWheel's own mInProc guard cannot see this case: it
' only knows about re-entry from itself.
' Same reasoning as mBusy during a render - if VBA is already running, the wheel is
' inert until it is not.
Private Sub UserForm_Activate()
    On Error Resume Next
    modMouseWheel.Enabled = False               ' first line: nothing below is re-entrant
    HookWheel Me.caption                        ' set once in Initialize, never changes
    SetWheelPage fraBody                        ' the target whenever no dropdown is open
    cboCostbook.SetFocus
    modMouseWheel.Enabled = Not mBusy           ' last line: safe to take the wheel again
    On Error GoTo 0
End Sub

' Leaving for another application: drop the wheel entirely. Nothing should be
' scrolling this form while it is not the active window, and re-activation turns it
' back on above.
Private Sub UserForm_Deactivate()
    On Error Resume Next
    modMouseWheel.Enabled = False
    On Error GoTo 0
End Sub

' The last clipboard release + scratch-sheet sweep.
'
' Every preview does grp.CopyPicture, which leaves Excel publishing a DELAYED-RENDER
' promise pointing at the scratch shapes; EndTemp then deletes them. If the promise
' outlives its source, nothing notices until something FLUSHES the clipboard - and
' closing any workbook does exactly that, which is why the hang used to show up later,
' on an unrelated file, long after the form was gone.
'
' CleanupScratch does both halves in the safe order (revoke the OLE offer, THEN delete
' any shapes an abandoned render left behind) - see modCostbookCharts.
'
' *** NEVER tear the form down while a render is running. *** QueryClose is reached
' from inside ShowPreview's DoEvents when the user clicks the title-bar X mid-render;
' unloading there strands the render on the stack with its CleanUp block unreached, so
' EndTemp never runs, the scratch shapes survive, and Excel keeps promising to render
' a picture of them. Veto that close and let the render finish - every CleanUp block
' ends in HonorPendingClose, which performs the deferred Unload.
'
' The veto is limited to vbFormControlMenu (the X) ON PURPOSE. A programmatic Unload
' must never be refused:
'   - btnClose_Click already defers on its own before calling Unload;
'   - TpcReset unloads leftover forms to RECOVER from a stuck state, where a stale
'     mBusy = True (a render killed by End in the VBE) is exactly the case it exists
'     to clear - vetoing it there would make the rescue macro spin and give up;
'   - vbAppWindows / vbAppTaskManager are Excel shutting down, which cannot be refused.
Private Sub UserForm_QueryClose(Cancel As Integer, CloseMode As Integer)
    Trc "UserForm_QueryClose", "CloseMode=" & CloseMode & " busy=" & mBusy
    If mBusy And CloseMode = vbFormControlMenu Then
        TrcAlert "Close (title-bar X) requested DURING a render - vetoed and deferred."
        Cancel = 1                              ' 1 = veto this close, not "cancelled"
        mCloseRequested = True
        SetStatus "Finishing the current render, then closing..."
        Exit Sub
    End If
    If mBusy Then TrcAlert "Forced close during a render (CloseMode=" & CloseMode & _
                           ") - sweeping the scratch sheet here instead."
    mBusy = False                ' nothing may start a new render on a dying form
    mCloseRequested = False
    UnhookWheel                 ' FIRST: restore the window proc while the window lives
    RestoreExcelUI              ' never leave Excel with ScreenUpdating off
    CleanupScratch              ' revoke the clipboard offer, then drop the shapes
    DetachFilters
End Sub

' Terminate cannot be vetoed, so it is the unconditional backstop: if the form is
' being destroyed anyway (Unload from TpcReset, an End in the VBE, Excel shutting
' down), clear the flag and sweep regardless.
Private Sub UserForm_Terminate()
    Trc "UserForm_Terminate", "busy=" & mBusy
    If mBusy Then TrcAlert "Terminated while a render was in flight - its CleanUp block " & _
                           "will not run. Check the scratch sheet and OWN below."
    mBusy = False
    mCloseRequested = False
    UnhookWheel                 ' idempotent - QueryClose normally got there first
    RestoreExcelUI              ' never leave Excel with ScreenUpdating off
    CleanupScratch
    DetachFilters
    Trc "UserForm_Terminate", "done - OWN must read free"
End Sub

' Called at the end of every render / export CleanUp block, once mBusy is back to
' False. Honours a close the user asked for while the render was in flight.
Private Sub HonorPendingClose()
    If Not mCloseRequested Then Exit Sub
    If mBusy Then Exit Sub                      ' a nested render is still running
    mCloseRequested = False
    Unload Me
End Sub

' Each clsMultiFilter holds a back-reference to this form AND a WithEvents reference
' to each of the controls it built; without breaking the cycle the form object
' outlives Unload. That is not cosmetic - a leaked form leaves its ThunderDFrame
' window alive on Excel's UI thread, Excel's main window stays disabled behind it,
' and the next attempt to close ANY workbook spins on a busy pointer while macros
' carry on running normally. See clsMultiFilter.Detach for why clearing the owner
' alone was not enough, and modTpcWin32's header for the window-level symptom.
Private Sub DetachFilters()
    On Error Resume Next
    Dim f As Variant
    For Each f In Array(mfRegion, mfType, mfPlatform, mfPtrain, mfMilestone, mfSplit, _
                        mfExRegion, mfExProject, mfExMilestone, mfExType, _
                        mfExPlatform, mfExPtrain, mfExCarline)
        If Not f Is Nothing Then f.Detach
    Next f
    On Error GoTo 0
End Sub

'================================ UI BUILD =====================================
Private Sub BuildUI()
    Const m As Single = 10
    Dim W As Single, H As Single
    W = Me.InsideWidth: H = Me.InsideHeight
    Set mPage1Ctls = New Collection
    Set mPage2Ctls = New Collection
    Set mPage3Ctls = New Collection
    Set mSharedP12Ctls = New Collection

    '---- fixed header band ----------------------------------------------------
    Dim hdrH As Single: hdrH = 40
    AddBand Me, "bandHeader", 0, 0, W, hdrH, NAVY
    With AddLabel(Me, "lblTitle", "Comparison & Synthesis Generator", m + 4, 0, W - 756, hdrH)
        .ForeColor = vbWhite
        .font.bold = True
        .font.Size = 13
        .TextAlign = fmTextAlignLeft
        .font.name = "Segoe UI"
    End With

    ' global display-currency selector (applies to ALL pages / all data), placed
    ' between the title and the page tabs so it reads as a tool-wide units switch
    With AddLabel(Me, "lblCurrency", "Currency:", W - 746, 13, 52, 14)
        .ForeColor = vbWhite
        .font.Size = 8.5
        .font.name = "Segoe UI"
        .TextAlign = fmTextAlignRight
    End With
    Set cboCurrency = Me.Controls.Add("Forms.ComboBox.1", "cboCurrency", True)
    PlaceCtl cboCurrency, W - 690, 11, 150, 18       ' wide enough for "(Source currency: EUR)"
    cboCurrency.style = fmStyleDropDownList          ' pick-only: no free typing
    cboCurrency.font.name = "Segoe UI"
    cboCurrency.font.Size = 8.5

    ' page tabs + export, right-aligned in the header (caption follows the page)
    Set btnPage1 = AddButton(Me, "btnPage1", "Cost Analysis", W - 528, 7, 108, hdrH - 14, False)
    Set btnPage2 = AddButton(Me, "btnPage2", "Comparison", W - 414, 7, 108, hdrH - 14, False)
    Set btnPage3 = AddButton(Me, "btnPage3", "Data Explorer", W - 300, 7, 108, hdrH - 14, False)
    Set btnExtract = AddButton(Me, "btnExtract", "Export Costbook Report", W - 186, 7, 176, hdrH - 14, True)
    btnExtract.BackColor = RGB(46, 155, 71)          ' green = the money action

    '---- fixed bottom action row ----------------------------------------------
    Dim botH As Single: botH = 26
    Set lblStatus = AddLabel(Me, "lblStatus", "Ready.", m, H - botH + 4, W - 2 * m - 90, 14)
    lblStatus.ForeColor = GRAYTXT
    Set btnClose = AddButton(Me, "btnClose", "Close", W - 80, H - botH + 1, 70, 21, False)

    '---- scrollable body frame ------------------------------------------------
    Set fraBody = Me.Controls.Add("Forms.Frame.1", "fraBody", True)
    PlaceCtl fraBody, 0, hdrH, W, H - hdrH - botH
    fraBody.caption = ""
    fraBody.BorderStyle = fmBorderStyleNone
    fraBody.SpecialEffect = fmSpecialEffectFlat
    fraBody.BackColor = vbWhite
    fraBody.ScrollBars = fmScrollBarsVertical
    fraBody.ScrollWidth = 0

    Dim Wb As Single, visH As Single
    Wb = W - 18                          ' body width minus the vertical scrollbar
    visH = H - hdrH - botH               ' visible body height (one "screen")

    '---- filter card ----------------------------------------------------------
    Dim fcTop As Single, fcH As Single
    fcTop = 6: fcH = 88
    AddCard "cardFilters", m, fcTop, Wb - 2 * m, fcH, "Costbook selection"
    SharedP12 fraBody.Controls("cardFilters"): SharedP12 fraBody.Controls("lblcardFilters")

    Dim rowA As Single, rowB As Single, x As Single, cw As Single, btnW As Single
    rowA = fcTop + 30                    ' combo row A (labels sit at rowA - 11)
    rowB = fcTop + 60                    ' combo row B
    btnW = 84
    cw = (Wb - 2 * m - 16 - btnW - 10) / 7 - 8      ' 7 slots on row A (5 shared + 2 page-2)

    ' the five attribute filters are MULTI-select (check any number of values)
    x = m + 8
    Set mfRegion = NewMultiFilter("mfRegion", "Region", x, rowA, cw, "p12")
    SharedP12 mfRegion
    x = x + cw + 8
    Set mfType = NewMultiFilter("mfType", "Type", x, rowA, cw, "p12")
    SharedP12 mfType
    x = x + cw + 8
    Set mfPlatform = NewMultiFilter("mfPlatform", "Platform", x, rowA, cw, "p12")
    SharedP12 mfPlatform
    x = x + cw + 8
    Set mfPtrain = NewMultiFilter("mfPtrain", "Powertrain", x, rowA, cw, "p12")
    SharedP12 mfPtrain
    x = x + cw + 8
    Set mfMilestone = NewMultiFilter("mfMilestone", "Milestone", x, rowA, cw, "p12")
    SharedP12 mfMilestone

    ' page 2 only: analysis level / 5th split selections at the right of row A
    x = x + cw + 8
    Set cboLevel = AddFilter("cboLevel", "Analysis Level", x, rowA, cw)
    Page2 cboLevel: Page2 fraBody.Controls("lblcboLevel")
    x = x + cw + 8
    Set mfSplit = NewMultiFilter("mfSplit", "5th Split", x, rowA, cw, "p2")
    Page2 mfSplit

    ' clear-filters, right-aligned on row A (pages 1 & 2)
    Set btnClearFilters = AddButton(fraBody, "btnClearFilters", "Clear filters", _
                                    Wb - m - 8 - btnW, rowA, btnW, 18, False)
    SharedP12 btnClearFilters

    ' row B, page 1: the single costbook selector
    With AddLabel(fraBody, "lblCostbook", "Costbook (Vehicle | Milestone | Date):", m + 8, rowB + 3, 180, 12)
        .ForeColor = NAVY
        .font.Size = 8
    End With
    Page1 fraBody.Controls("lblCostbook")
    Set cboCostbook = AddCombo("cboCostbook", m + 192, rowB, Wb * 0.55)
    Page1 cboCostbook

    ' row B, page 2: up to three costbook selectors
    Dim cwCar As Single: cwCar = (Wb - 2 * m - 16 - 100) / 3 - 8
    With AddLabel(fraBody, "lblCars", "Carlines (V1..V3):", m + 8, rowB + 3, 90, 12)
        .ForeColor = NAVY
        .font.Size = 8
    End With
    Page2 fraBody.Controls("lblCars")
    Set cboCar1 = AddCombo("cboCar1", m + 100, rowB, cwCar)
    Set cboCar2 = AddCombo("cboCar2", m + 100 + (cwCar + 8), rowB, cwCar)
    Set cboCar3 = AddCombo("cboCar3", m + 100 + 2 * (cwCar + 8), rowB, cwCar)
    Page2 cboCar1: Page2 cboCar2: Page2 cboCar3

    '---- charts zone: full width, ~one screen tall each -----------------------
    Dim chTop As Single, chH As Single, chW As Single
    chTop = fcTop + fcH + 24
    chH = visH - 60
    If chH < 300 Then chH = 300
    chW = Wb - 2 * m

    Const pngW As Single = 74           ' per-chart "Save PNG" button (right of the caption)

    ' page 1: bars full width, pie full width underneath (scroll to it)
    AddCaption "capBars", "Cost structure - TPC by L1 Macro System", m, chTop - 14, True
    Set imgBars = AddImage(fraBody, "imgBars", m, chTop, chW, chH)
    Set lblBarsPh = AddPlaceholder("phBars", "Select a costbook to render the charts", m, chTop, chW, chH)
    Set btnPngBars = AddPngButton("btnPngBars", m + chW - pngW, chTop - 15, pngW)
    Page1 fraBody.Controls("capBars"): Page1 imgBars: Page1 lblBarsPh: Page1 btnPngBars

    Dim pieTop As Single
    pieTop = chTop + chH + 28
    AddCaption "capPie", "Cost split - TPC by 5th", m, pieTop - 14, True
    Set imgPie = AddImage(fraBody, "imgPie", m, pieTop, chW, chH)
    Set lblPiePh = AddPlaceholder("phPie", "-", m, pieTop, chW, chH)
    Set btnPngPie = AddPngButton("btnPngPie", m + chW - pngW, pieTop - 15, pngW)
    Page1 fraBody.Controls("capPie"): Page1 imgPie: Page1 lblPiePh: Page1 btnPngPie

    ' page 2: waterfall full width
    AddCaption "capWater", "TPC Walk - Baseline vs comparison carlines", m, chTop - 14, True
    Set imgWaterfall = AddImage(fraBody, "imgWaterfall", m, chTop, chW, chH)
    Set lblWaterPh = AddPlaceholder("phWater", "Select at least two carlines (V1 + V2)", m, chTop, chW, chH)
    Set btnPngWater = AddPngButton("btnPngWater", m + chW - pngW, chTop - 15, pngW)
    Page2 fraBody.Controls("capWater"): Page2 imgWaterfall: Page2 lblWaterPh: Page2 btnPngWater

    '---- bottom Pareto / gap lists -------------------------------------------
    Dim halfW As Single, listH As Single
    halfW = (Wb - 2 * m - 10) / 2
    listH = 216

    ' page 1 (below the pie)
    Dim list1Top As Single
    list1Top = pieTop + chH + 16
    AddCard "cardSystems", m, list1Top, halfW, listH, "Top 10 Systems (L2)"
    Set lstSystems = AddList("lstSystems", m + 6, list1Top + 28, halfW - 12, listH - 34, 4)
    AddListHeader "hdrSys", m + 6, list1Top + 16, halfW - 12, _
                  Array("L2 System", "TPC", "TPC %", "Cumulative %")
    AddCard "cardParts", m + halfW + 10, list1Top, halfW, listH, "Top 10 Parts (normalized)"
    Set lstParts = AddList("lstParts", m + halfW + 16, list1Top + 28, halfW - 12, listH - 34, 4)
    AddListHeader "hdrPar", m + halfW + 16, list1Top + 16, halfW - 12, _
                  Array("Normalized Part", "TPC", "TPC %", "Cumulative %")
    Page1 fraBody.Controls("cardSystems"): Page1 fraBody.Controls("lblcardSystems"): Page1 lstSystems
    Page1 fraBody.Controls("cardParts"): Page1 fraBody.Controls("lblcardParts"): Page1 lstParts
    PageList mPage1Ctls, "hdrSys", 4
    PageList mPage1Ctls, "hdrPar", 4
    mScrollH1 = list1Top + listH + 14

    ' page 2 (below the waterfall)
    Dim list2Top As Single
    list2Top = chTop + chH + 16
    AddCard "cardGapSplit", m, list2Top, halfW, listH, "Gap by 5th"
    Set lblGapSplitTitle = fraBody.Controls("lblcardGapSplit")
    Set lstGapSplit = AddList("lstGapSplit", m + 6, list2Top + 28, halfW - 12, listH - 34, 6)
    AddListHeader "hdrGS", m + 6, list2Top + 16, halfW - 12, _
                  Array("5th", "TPC V1", "TPC V2/V3", "Gap", "Gap %")
    AddCard "cardGapTop", m + halfW + 10, list2Top, halfW, listH, "Top 10 by Absolute Gap"
    Set lblGapTopTitle = fraBody.Controls("lblcardGapTop")
    Set lstGapTop = AddList("lstGapTop", m + halfW + 16, list2Top + 28, halfW - 12, listH - 34, 6)
    AddListHeader "hdrGT", m + halfW + 16, list2Top + 16, halfW - 12, _
                  Array("Item", "TPC V1", "TPC V2/V3", "Gap", "Gap %")
    With AddLabel(fraBody, "lblNotes", "Preview compares up to 3 carlines (export up to 5)" & _
                  " - waterfall steps beyond the 10 biggest gaps are grouped in 'Other'" & _
                  " - total bars are always split by 5th; '5th Split' restricts the whole comparison" & _
                  " (tick several 5ths, or 'Select all' minus one to exclude it)" & _
                  " - 'Analysis Level' drives the waterfall steps and the gap list", _
                  m + 4, list2Top + listH + 6, Wb - 2 * m, 12)
        .ForeColor = GRAYTXT
        .font.Size = 7.5
    End With
    Page2 fraBody.Controls("cardGapSplit"): Page2 lblGapSplitTitle: Page2 lstGapSplit
    Page2 fraBody.Controls("cardGapTop"): Page2 lblGapTopTitle: Page2 lstGapTop
    Page2 fraBody.Controls("lblNotes")
    PageList mPage2Ctls, "hdrGS", 5
    PageList mPage2Ctls, "hdrGT", 5
    mScrollH2 = list2Top + listH + 30

    '======================= page 3: Data Explorer =============================
    ' its own filter card, drawn over the same top area as the shared one (which is
    ' hidden on page 3): 7 filters on row A, a hint on row B
    AddCard "cardExFilters", m, fcTop, Wb - 2 * m, fcH, "Data Explorer - browse the costbook records"
    Page3 fraBody.Controls("cardExFilters"): Page3 fraBody.Controls("lblcardExFilters")

    Dim exX As Single, exCw As Single
    exCw = (Wb - 2 * m - 16 - btnW - 10) / 7 - 8
    exX = m + 8
    Set mfExRegion = AddExFilter("mfExRegion", "Region", exX, rowA, exCw): exX = exX + exCw + 8
    Set mfExProject = AddExFilter("mfExProject", "Project", exX, rowA, exCw): exX = exX + exCw + 8
    Set mfExMilestone = AddExFilter("mfExMilestone", "Milestone", exX, rowA, exCw): exX = exX + exCw + 8
    Set mfExType = AddExFilter("mfExType", "Type", exX, rowA, exCw): exX = exX + exCw + 8
    Set mfExPlatform = AddExFilter("mfExPlatform", "Platform", exX, rowA, exCw): exX = exX + exCw + 8
    Set mfExPtrain = AddExFilter("mfExPtrain", "Powertrain", exX, rowA, exCw): exX = exX + exCw + 8
    Set mfExCarline = AddExFilter("mfExCarline", "Carline Code", exX, rowA, exCw)

    Set btnExClear = AddButton(fraBody, "btnExClear", "Clear filters", _
                               Wb - m - 8 - btnW, rowA, btnW, 18, False)
    Page3 btnExClear
    With AddLabel(fraBody, "lblExHint", "One row per costbook record. Select a row and " & _
                  ChrW(8595) & " Open source file (or double-click) to download the original " & _
                  "costbook. TPC is each costbook's total in its own currency.", _
                  m + 8, rowB + 3, Wb - 2 * m - 16, 12)
        .ForeColor = GRAYTXT
        .font.Size = 8
    End With
    Page3 fraBody.Controls("lblExHint")

    ' records caption + Open-source action, then the header row and the big list
    Dim exTop As Single, exListTop As Single, exListH As Single, exW As Single
    exTop = fcTop + fcH + 22
    exW = Wb - 2 * m
    AddCaption "capExplorer", "Costbook records", m, exTop - 14, True
    Page3 fraBody.Controls("capExplorer")
    Set btnOpenSource = AddButton(fraBody, "btnOpenSource", ChrW(8595) & " Open source file", _
                                  m + exW - 160, exTop - 16, 160, 18, True)
    btnOpenSource.BackColor = RGB(46, 155, 71)
    Page3 btnOpenSource

    exListTop = exTop + 4
    AddExplorerHeader "exHdr", m + 3, exListTop, ExplorerHeaders(), ExplorerColWidths()
    exListH = visH - exListTop - 16
    If exListH < 260 Then exListH = 260
    Set lstExplorer = AddList("lstExplorer", m, exListTop + 13, exW, exListH, _
                              UBound(ExplorerHeaders()) + 1)      ' 10 (MSForms ListBox max)
    lstExplorer.ColumnWidths = ExplorerWidthsSpec()
    Page3 lstExplorer

    mScrollH3 = exListTop + 13 + exListH + 16
End Sub

'------------------------------ control factories ------------------------------
Private Function AddBand(ByVal parent As Object, ByVal nm As String, ByVal L As Single, _
        ByVal T As Single, ByVal W As Single, ByVal H As Single, ByVal color As Long) As MSForms.label
    Dim c As MSForms.label
    Set c = parent.Controls.Add("Forms.Label.1", nm, True)
    PlaceCtl c, L, T, W, H
    c.BackStyle = fmBackStyleOpaque
    c.BackColor = color
    c.caption = ""
    Set AddBand = c
End Function

Private Function AddLabel(ByVal parent As Object, ByVal nm As String, ByVal cap As String, _
        ByVal L As Single, ByVal T As Single, ByVal W As Single, ByVal H As Single) As MSForms.label
    Dim c As MSForms.label
    Set c = parent.Controls.Add("Forms.Label.1", nm, True)
    PlaceCtl c, L, T, W, H
    c.caption = cap
    c.BackStyle = fmBackStyleTransparent
    c.font.name = "Segoe UI"
    c.font.Size = 9
    Set AddLabel = c
End Function

Private Function AddButton(ByVal parent As Object, ByVal nm As String, ByVal cap As String, _
        ByVal L As Single, ByVal T As Single, ByVal W As Single, ByVal H As Single, _
        ByVal primary As Boolean) As MSForms.CommandButton
    Dim c As MSForms.CommandButton
    Set c = parent.Controls.Add("Forms.CommandButton.1", nm, True)
    PlaceCtl c, L, T, W, H
    c.caption = cap
    c.font.name = "Segoe UI"
    c.font.Size = 9
    If primary Then
        c.BackColor = NAVY
        c.ForeColor = vbWhite
        c.font.bold = True
    End If
    Set AddButton = c
End Function

Private Function AddImage(ByVal parent As Object, ByVal nm As String, ByVal L As Single, _
        ByVal T As Single, ByVal W As Single, ByVal H As Single) As MSForms.image
    Dim c As MSForms.image
    Set c = parent.Controls.Add("Forms.Image.1", nm, True)
    PlaceCtl c, L, T, W, H
    c.BorderStyle = fmBorderStyleSingle
    c.BorderColor = PREV_LINE
    c.BackColor = vbWhite
    c.PictureSizeMode = fmPictureSizeModeZoom
    c.PictureAlignment = fmPictureAlignmentCenter
    Set AddImage = c
End Function

Private Function AddPlaceholder(ByVal nm As String, ByVal cap As String, ByVal L As Single, _
        ByVal T As Single, ByVal W As Single, ByVal H As Single) As MSForms.label
    Dim c As MSForms.label
    Set c = AddLabel(fraBody, nm, cap, L, T + H / 2 - 8, W, 16)
    c.ForeColor = GRAYTXT
    c.TextAlign = fmTextAlignCenter
    Set AddPlaceholder = c
End Function

' Bordered light card + bold navy title (a Label, never a runtime Frame).
Private Sub AddCard(ByVal nm As String, ByVal L As Single, ByVal T As Single, _
        ByVal W As Single, ByVal H As Single, ByVal Title As String)
    With AddLabel(fraBody, nm, "", L, T, W, H)
        .BackStyle = fmBackStyleOpaque
        .BackColor = CARD_FILL
        .BorderStyle = fmBorderStyleSingle
        .BorderColor = CARD_LINE
    End With
    With AddLabel(fraBody, "lbl" & nm, Title, L + 6, T + 3, W - 12, 12)
        .ForeColor = NAVY
        .font.bold = True
        .font.Size = 8.5
    End With
End Sub

' Small secondary "Save PNG" button, aligned to the right edge of a chart caption.
Private Function AddPngButton(ByVal nm As String, ByVal L As Single, ByVal T As Single, _
        ByVal W As Single) As MSForms.CommandButton
    Dim c As MSForms.CommandButton
    Set c = AddButton(fraBody, nm, "Save PNG", L, T, W, 16, False)
    c.font.Size = 7.5
    Set AddPngButton = c
End Function

Private Sub AddCaption(ByVal nm As String, ByVal cap As String, ByVal L As Single, _
        ByVal T As Single, ByVal bold As Boolean)
    With AddLabel(fraBody, nm, cap, L, T, 320, 12)
        .ForeColor = NAVY
        .font.bold = bold
        .font.Size = 8.5
    End With
End Sub

' Small caption label + combo underneath-right of it (used for the filter row).
Private Function AddFilter(ByVal nm As String, ByVal cap As String, ByVal L As Single, _
        ByVal T As Single, ByVal W As Single) As MSForms.ComboBox
    With AddLabel(fraBody, "lbl" & nm, cap & ":", L, T - 11, W, 10)
        .ForeColor = NAVY
        .font.Size = 7.5
    End With
    Set AddFilter = AddCombo(nm, L, T, W)
End Function

' A Power BI style multi-select filter (caption + closed box in the scrolling body,
' popup on the form itself so the body frame can't clip it). tag tells
' MultiFilterChanged which page's cascade to run.
Private Function NewMultiFilter(ByVal nm As String, ByVal cap As String, ByVal L As Single, _
        ByVal T As Single, ByVal W As Single, ByVal tg As String) As clsMultiFilter
    Dim f As clsMultiFilter
    Set f = New clsMultiFilter
    f.Init Me, fraBody, Me, nm, cap, L, T, W, tg      ' popup on Me: fraBody would clip it
    Set NewMultiFilter = f
End Function

' Like NewMultiFilter, but registers the filter on the page-3 collection.
Private Function AddExFilter(ByVal nm As String, ByVal cap As String, ByVal L As Single, _
        ByVal T As Single, ByVal W As Single) As clsMultiFilter
    Dim f As clsMultiFilter
    Set f = NewMultiFilter(nm, cap, L, T, W, "ex")
    Page3 f
    Set AddExFilter = f
End Function

' Data Explorer list headers. A native MSForms ListBox allows at most 10 columns,
' so the on-form list shows these ten (all separate). Platform / Powertrain / Program
' are dropped here (Platform & Powertrain are already encoded in the wide Carline
' Code, and all three stay as filters) - the Export List workbook keeps every column.
Private Function ExplorerHeaders() As Variant
    ExplorerHeaders = Array("Region", "Project", "Carline Code", "Milestone", _
        "Milestone Date", "Phase", "Currency", "TPC", "PCP Team", "Reference Person")
End Function

' Column widths (pt) matching ExplorerHeaders (10 columns). Carline Code is wide
' (long vehicle codes, often differ by a single word) and Reference Person is wide
' (it holds the e-mail).
Private Function ExplorerColWidths() As Variant
    ExplorerColWidths = Array(48, 66, 200, 72, 74, 56, 48, 84, 90, 190)
End Function

' ListBox ColumnWidths spec string built from ExplorerColWidths ("48 pt;66 pt;...").
Private Function ExplorerWidthsSpec() As String
    Dim W As Variant: W = ExplorerColWidths()
    Dim s As String, i As Long
    For i = LBound(W) To UBound(W)
        s = s & IIf(Len(s) > 0, ";", "") & CStr(W(i)) & " pt"
    Next i
    ExplorerWidthsSpec = s
End Function

' Bold header labels above the Data Explorer list, positioned to match the column
' widths (so they line up with the list's columns).
Private Sub AddExplorerHeader(ByVal nmPrefix As String, ByVal L As Single, ByVal T As Single, _
        ByVal caps As Variant, ByVal widths As Variant)
    Dim i As Long, x As Single
    x = L
    For i = LBound(caps) To UBound(caps)
        With AddLabel(fraBody, nmPrefix & i, CStr(caps(i)), x, T, CSng(widths(i)), 10)
            .font.bold = True
            .font.Size = 7.5
            .ForeColor = GRAYTXT
        End With
        Page3 fraBody.Controls(nmPrefix & i)
        x = x + CSng(widths(i))
    Next i
End Sub

' Editable combo: the user can type (with autocomplete) or clear the text to
' reset a filter. Change handlers ignore partial text that matches no item.
Private Function AddCombo(ByVal nm As String, ByVal L As Single, ByVal T As Single, _
        ByVal W As Single) As MSForms.ComboBox
    Dim c As MSForms.ComboBox
    Set c = fraBody.Controls.Add("Forms.ComboBox.1", nm, True)
    PlaceCtl c, L, T, W, 18
    c.style = fmStyleDropDownCombo
    c.MatchEntry = fmMatchEntryComplete
    c.font.name = "Segoe UI"
    c.font.Size = 8.5
    Set AddCombo = c
End Function

Private Function AddList(ByVal nm As String, ByVal L As Single, ByVal T As Single, _
        ByVal W As Single, ByVal H As Single, ByVal nCols As Long) As MSForms.ListBox
    Dim c As MSForms.ListBox
    Set c = fraBody.Controls.Add("Forms.ListBox.1", nm, True)
    PlaceCtl c, L, T, W, H
    c.ColumnCount = nCols
    c.font.name = "Segoe UI"
    c.font.Size = 8.5
    c.BorderStyle = fmBorderStyleSingle
    c.BorderColor = PREV_LINE
    Set AddList = c
End Function

' Bold column headers above a listbox: first column takes the leftover width,
' numeric columns get 55pt each (matches SetListWidths).
Private Sub AddListHeader(ByVal nmPrefix As String, ByVal L As Single, ByVal T As Single, _
        ByVal W As Single, ByVal caps As Variant)
    Dim n As Long, i As Long, x As Single, cw As Single
    n = UBound(caps) - LBound(caps) + 1
    x = L + 2
    For i = 0 To n - 1
        If i = 0 Then cw = W - (n - 1) * 55 - 4 Else cw = 55
        With AddLabel(fraBody, nmPrefix & i, CStr(caps(i)), x, T, cw, 10)
            .font.bold = True
            .font.Size = 7.5
            .ForeColor = GRAYTXT
        End With
        x = x + cw
    Next i
End Sub

' Column widths matching AddListHeader: first column stretches, others 55pt.
Private Sub SetListWidths(ByVal lst As MSForms.ListBox, ByVal nCols As Long)
    Dim s As String, i As Long
    s = CStr(Int(lst.width - (nCols - 1) * 55 - 6)) & " pt"
    For i = 2 To nCols
        s = s & ";55 pt"
    Next i
    lst.ColumnWidths = s
End Sub

Private Sub PlaceCtl(ByVal c As Object, ByVal L As Single, ByVal T As Single, _
        ByVal W As Single, ByVal H As Single)
    c.Left = L: c.top = T: c.width = W: c.Height = H
End Sub

Private Sub Page1(ByVal c As Object)
    mPage1Ctls.Add c
End Sub
Private Sub Page2(ByVal c As Object)
    mPage2Ctls.Add c
End Sub
Private Sub Page3(ByVal c As Object)
    mPage3Ctls.Add c
End Sub
Private Sub SharedP12(ByVal c As Object)     ' visible on pages 1 & 2, hidden on page 3
    mSharedP12Ctls.Add c
End Sub
' Registers the numbered header labels (AddListHeader) on a page collection.
Private Sub PageList(ByVal col As Collection, ByVal nmPrefix As String, ByVal n As Long)
    Dim i As Long
    For i = 0 To n - 1
        col.Add fraBody.Controls(nmPrefix & i)
    Next i
End Sub

'================================ LIST LOADING =================================
Private Sub LoadLists()
    mLoading = True
    On Error Resume Next

    Dim v As Variant
    cboLevel.Clear
    For Each v In LevelNames(): cboLevel.AddItem v: Next v
    cboLevel.ListIndex = 0
    mfSplit.SetItems SplitValues()       ' the 5th column's values (nothing ticked = all)
    cboCurrency.Clear                    ' "(Source currency)" + EUR + ExchangeRates currencies
    For Each v In CurrencyChoices(): cboCurrency.AddItem v: Next v
    cboCurrency.ListIndex = 0            ' default: no conversion (each in its own currency)
    SetTargetCurrency CUR_ORIGINAL

    PopulateFilters
    PopulateCostbookCombos
    If cboCostbook.ListCount > 0 Then cboCostbook.ListIndex = 0
    PopulateExplorerFilters

    On Error GoTo 0
    mLoading = False
End Sub

' Repopulates the five attribute filters, each restricted by the OTHER four
' (cascading), preserving current selections. Runs under the caller's guard.
' Milestone comes back in MilestonesList "Index" order (DistinctAttr sorts it that
' way) and only ever lists milestones that some matching costbook actually has.
Private Sub PopulateFilters()
    mfRegion.SetItems DistinctAttr(CI_REGION, FILTER_ALL, mfType.value, mfPlatform.value, mfPtrain.value, mfMilestone.value)
    mfType.SetItems DistinctAttr(CI_TYPE, mfRegion.value, FILTER_ALL, mfPlatform.value, mfPtrain.value, mfMilestone.value)
    mfPlatform.SetItems DistinctAttr(CI_PLATFORM, mfRegion.value, mfType.value, FILTER_ALL, mfPtrain.value, mfMilestone.value)
    mfPtrain.SetItems DistinctAttr(CI_PTRAIN, mfRegion.value, mfType.value, mfPlatform.value, FILTER_ALL, mfMilestone.value)
    mfMilestone.SetItems DistinctAttr(CI_MILESTONE, mfRegion.value, mfType.value, mfPlatform.value, mfPtrain.value, FILTER_ALL)
End Sub

' Repopulates the page-1 costbook combo and the three page-2 carline combos from
' the filtered index, preserving selections where still available.
Private Sub PopulateCostbookCombos()
    mCostbooks = FilteredCostbooks(mfRegion.value, mfType.value, mfPlatform.value, _
                                   mfPtrain.value, mfMilestone.value)

    Dim displays() As String, n As Long, i As Long
    If IsArray(mCostbooks) Then n = UBound(mCostbooks, 1)
    ReDim displays(0 To IIf(n < 1, 0, n - 1))
    For i = 1 To n
        displays(i - 1) = CStr(mCostbooks(i, CI_DISPLAY))
    Next i

    ReloadComboArr cboCostbook, displays, n, False
    ReloadComboArr cboCar1, displays, n, True
    ReloadComboArr cboCar2, displays, n, True
    ReloadComboArr cboCar3, displays, n, True
End Sub

' Swaps a combo's items for arr(0..n-1), keeping the previous selection when the
' text still exists. withNone prefixes a "(none)" entry (page-2 carline combos).
Private Sub ReloadComboArr(ByVal cbo As MSForms.ComboBox, ByRef arr() As String, _
        ByVal n As Long, ByVal withNone As Boolean)
    Dim keep As String, idx As Long, i As Long
    keep = Trim$(cbo.value & "")
    idx = -1
    cbo.Clear
    If withNone Then cbo.AddItem "(none)"
    For i = 0 To n - 1
        cbo.AddItem arr(i)
        If StrComp(arr(i), keep, vbTextCompare) = 0 Then idx = cbo.ListCount - 1
    Next i
    If idx < 0 And withNone Then idx = 0
    If idx >= 0 Then cbo.ListIndex = idx
End Sub

' Current single-select filter value (Analysis Level / 5th Split - those stay
' one-of-N); cleared / partial text counts as "(All)".
Private Function Sel(ByVal cbo As MSForms.ComboBox) As String
    Sel = Trim$(cbo.value & "")
    If Len(Sel) = 0 Then Sel = FILTER_ALL
End Function

' True while the combo holds PARTIAL text matching no list item (user typing).
Private Function ComboPartial(ByVal cbo As MSForms.ComboBox) As Boolean
    Dim T As String, i As Long
    T = Trim$(cbo.value & "")
    If Len(T) = 0 Then Exit Function
    For i = 0 To cbo.ListCount - 1
        If StrComp(CStr(cbo.List(i)), T, vbTextCompare) = 0 Then Exit Function
    Next i
    ComboPartial = True
End Function

'================================ PAGE SWITCH ==================================
Private Sub SwitchPage(ByVal page As Long)
    mPage = page
    Dim c As Object
    For Each c In mPage1Ctls: c.Visible = (page = 1): Next c
    For Each c In mPage2Ctls: c.Visible = (page = 2): Next c
    For Each c In mPage3Ctls: c.Visible = (page = 3): Next c
    For Each c In mSharedP12Ctls: c.Visible = (page <> 3): Next c

    Select Case page
        Case 1: fraBody.ScrollHeight = mScrollH1
        Case 2: fraBody.ScrollHeight = mScrollH2
        Case Else: fraBody.ScrollHeight = mScrollH3
    End Select
    fraBody.ScrollTop = 0

    ' active tab reads as "pressed": white on navy vs navy on white
    StyleTab btnPage1, (page = 1)
    StyleTab btnPage2, (page = 2)
    StyleTab btnPage3, (page = 3)

    ' the export button says what it will actually produce
    Select Case page
        Case 1: btnExtract.caption = "Export Costbook Report"
        Case 2: btnExtract.caption = "Export Gap Report"
        Case Else: btnExtract.caption = "Export List"
    End Select

    Select Case page
        Case 1: RefreshPage1
        Case 2: RefreshPage2
        Case Else: RefreshPage3
    End Select
End Sub

Private Sub StyleTab(ByVal b As MSForms.CommandButton, ByVal active As Boolean)
    If active Then
        b.BackColor = vbWhite
        b.ForeColor = NAVY
        b.font.bold = True
    Else
        b.BackColor = NAVY
        b.ForeColor = vbWhite
        b.font.bold = False
    End If
End Sub

'================================ EVENTS =======================================
'-------------------------- multi-select filter callbacks ----------------------
' clsMultiFilter calls this ONCE, when its popup closes with the selection
' actually changed - so ticking five boxes re-renders the charts once, not five
' times. The tag says which cascade to run.
Public Sub MultiFilterChanged(ByVal f As Object)
    If mLoading Then Exit Sub
    Select Case f.tag
        Case "ex": OnExplorerFilterChange       ' page-3 filters
        Case "p2": If mPage = 2 Then RefreshPage2   ' 5th Split: re-aggregate only
        Case Else: OnFilterChange               ' page-1/2 attribute filters
    End Select
End Sub

' clsMultiFilter tells the owner when its popup opens and closes. These existed to
' stand the mouse-wheel hook down while a popup floated over the scrolling body;
' that hook is gone (see UserForm_Activate), so there is nothing to suspend. They
' stay as stubs because clsMultiFilter calls them by name on every popup.
' Part of the clsMultiFilter contract - it calls both, so both must exist by name.
' They were where the old wheel hook got suspended and resumed; the filter now
' redirects the wheel to its own list directly (clsMultiFilter.OpenPopup), so there
' is nothing left for the form to do here. Kept as the hook point for anything that
' needs to react to a dropdown opening later.
Public Sub PopupOpened()
End Sub

Public Sub PopupClosed()
End Sub

' Cascade: reload dependent lists under the guard, then ONE refresh.
Private Sub OnFilterChange()
    mLoading = True
    PopulateFilters
    PopulateCostbookCombos
    If cboCostbook.ListIndex < 0 And cboCostbook.ListCount > 0 Then cboCostbook.ListIndex = 0
    mLoading = False
    If mPage = 1 Then RefreshPage1 Else RefreshPage2
End Sub

' Resets the four attribute filters (and Level/Split defaults), keeping the
' costbook / carline picks where they still exist in the unfiltered list.
Private Sub btnClearFilters_Click()
    mLoading = True
    On Error Resume Next
    mfRegion.ClearAll
    mfType.ClearAll
    mfPlatform.ClearAll
    mfPtrain.ClearAll
    mfMilestone.ClearAll
    If cboLevel.ListCount > 0 Then cboLevel.ListIndex = 0
    mfSplit.ClearAll
    On Error GoTo 0
    PopulateFilters
    PopulateCostbookCombos
    If cboCostbook.ListIndex < 0 And cboCostbook.ListCount > 0 Then cboCostbook.ListIndex = 0
    mLoading = False
    If mPage = 1 Then RefreshPage1 Else RefreshPage2
End Sub

Private Sub cboCostbook_Change()
    If mLoading Then Exit Sub
    If ComboPartial(cboCostbook) Then Exit Sub
    RefreshPage1
End Sub
Private Sub cboCar1_Change()
    If mLoading Then Exit Sub
    If ComboPartial(cboCar1) Then Exit Sub
    RefreshPage2
End Sub
Private Sub cboCar2_Change()
    If mLoading Then Exit Sub
    If ComboPartial(cboCar2) Then Exit Sub
    RefreshPage2
End Sub
Private Sub cboCar3_Change()
    If mLoading Then Exit Sub
    If ComboPartial(cboCar3) Then Exit Sub
    RefreshPage2
End Sub
' Level / Split only re-aggregate page 2 (never page 1).
Private Sub cboLevel_Change()
    If mLoading Then Exit Sub
    If ComboPartial(cboLevel) Then Exit Sub
    If mPage = 2 Then RefreshPage2
End Sub
' (5th Split is a clsMultiFilter - it arrives through MultiFilterChanged, tag "p2")
' Currency applies to ALL data on both pages: switch the target currency, force a
' full re-render (the selection text is unchanged, only the underlying values are).
Private Sub cboCurrency_Change()
    If mLoading Then Exit Sub
    SetTargetCurrency Trim$(cboCurrency.value & "")
    mKeyP1 = vbNullChar: mKeyP2 = vbNullChar     ' sentinel: never matches a real key
    If mPage = 1 Then RefreshPage1 Else RefreshPage2   ' page 3 TPC is currency-independent
End Sub

'------------------------------ Data Explorer events ---------------------------
' (the 7 explorer filters are clsMultiFilter instances - they come in through
'  MultiFilterChanged with tag "ex")

' Cascade the explorer filters under the guard, then one refresh.
Private Sub OnExplorerFilterChange()
    mLoading = True
    PopulateExplorerFilters
    mLoading = False
    RefreshPage3
End Sub

Private Sub btnExClear_Click()
    mLoading = True
    On Error Resume Next
    mfExRegion.ClearAll: mfExProject.ClearAll
    mfExMilestone.ClearAll: mfExType.ClearAll
    mfExPlatform.ClearAll: mfExPtrain.ClearAll
    mfExCarline.ClearAll
    On Error GoTo 0
    PopulateExplorerFilters
    mLoading = False
    mKeyP3 = vbNullChar
    RefreshPage3
End Sub

' Open / download the source file of the selected record (button + double-click).
Private Sub btnOpenSource_Click()
    OpenSelectedSource
End Sub
Private Sub lstExplorer_DblClick(ByVal Cancel As MSForms.ReturnBoolean)
    OpenSelectedSource
End Sub
Private Sub OpenSelectedSource()
    Dim i As Long: i = lstExplorer.ListIndex
    If i < 0 Then SetStatus "Select a record first.": Exit Sub
    Dim url As String
    On Error Resume Next
    url = mExUrls(i)
    On Error GoTo 0
    If Len(url) = 0 Then SetStatus "No source file is linked for this record.": Exit Sub
    On Error GoTo OpenFail
    SetStatus "Opening source file..."
    ThisWorkbook.FollowHyperlink Address:=url
    Exit Sub
OpenFail:
    SetStatus "Could not open the source file: " & url
End Sub

Private Sub btnPage1_Click()
    If mPage <> 1 Then SwitchPage 1
End Sub
Private Sub btnPage2_Click()
    If mPage <> 2 Then SwitchPage 2
End Sub
Private Sub btnPage3_Click()
    If mPage <> 3 Then SwitchPage 3
End Sub
' Goes through QueryClose, so it gets the same "never unload mid-render" veto.
Private Sub btnClose_Click()
    If mBusy Then
        mCloseRequested = True
        SetStatus "Finishing the current render, then closing..."
        Exit Sub
    End If
    Unload Me
End Sub

' Per-chart PNG export (buttons on each chart caption).
Private Sub btnPngBars_Click()
    SavePngPage1 "bars"
End Sub
Private Sub btnPngPie_Click()
    SavePngPage1 "pie"
End Sub
Private Sub btnPngWater_Click()
    SavePngPage2
End Sub

Private Sub btnExtract_Click()
    If mBusy Then Exit Sub                       ' re-entered through a DoEvents
    TrcIn "btnExtract_Click", "page " & mPage
    mBusy = True
    btnExtract.Enabled = False
    On Error GoTo Fail
    If mPage = 1 Then
        Dim r As Long: r = SelectedCostbookRow()
        If r = 0 Then
            SetStatus "Select a costbook first."
        Else
            SetStatus "Generating the Costbook Report..."
            DoEvents
            ExtractFullReport CStr(mCostbooks(r, CI_VEHICLE)), _
                              CStr(mCostbooks(r, CI_MILESTONE)), _
                              CStr(mCostbooks(r, CI_DATEKEY))
            SetStatus "Costbook Report generated in a new (unsaved) workbook - it's now the active window."
        End If
    ElseIf mPage = 2 Then
        RunGapExport
    Else
        RunExplorerExport
    End If
    btnExtract.Enabled = True
    mBusy = False
    RestoreExcelUI          ' the report path flips DisplayAlerts; always end ON
    ReleaseClipboard False  ' the report workbook is about to be closed by hand
    TrcOut "btnExtract_Click"
    HonorPendingClose
    Exit Sub
Fail:
    TrcAlert "btnExtract_Click error " & Err.Number & ": " & Err.Description
    btnExtract.Enabled = True
    mBusy = False
    ' RunGapExport unloads frmGapExport on its own path only. A failure between its
    ' .Show and that Unload would leave the popup LOADED, and a UserForm left in
    ' memory is one of the things that makes Excel report itself busy to an incoming
    ' file-open request.
    On Error Resume Next
    Unload frmGapExport
    On Error GoTo 0
    RestoreExcelUI
    ReleaseClipboard False
    SetStatus "Report failed: " & Err.Description
    TrcOut "btnExtract_Click", "FAILED"
    HonorPendingClose
End Sub

' Page-2 export: a popup (frmGapExport) confirms / extends the comparison to up
' to 5 costbooks (the page's V1..V3 picks are prefilled, first = Baseline).
Private Sub RunGapExport()
    ' the same filtered costbook list that backs the page combos
    Dim displays() As String, n As Long, i As Long
    If IsArray(mCostbooks) Then n = UBound(mCostbooks, 1)
    If n = 0 Then
        SetStatus "No costbooks match the current filters."
        Exit Sub
    End If
    ReDim displays(0 To n - 1)
    For i = 1 To n
        displays(i - 1) = CStr(mCostbooks(i, CI_DISPLAY))
    Next i

    ' prefill with the distinct on-page picks (V1..V3)
    Dim pre As New Collection, cbos As Variant, T As String
    Dim seen As Object: Set seen = CreateObject("Scripting.Dictionary")
    seen.CompareMode = vbTextCompare
    cbos = Array(cboCar1, cboCar2, cboCar3)
    For i = 0 To 2
        If CarRow(cbos(i)) > 0 Then
            T = Trim$(cbos(i).value & "")
            If Not seen.Exists(T) Then
                seen.Add T, True
                pre.Add T
            End If
        End If
    Next i

    frmGapExport.InitPicks displays, n, pre
    frmGapExport.Show                        ' modal
    If frmGapExport.Cancelled Then
        SetStatus "Gap report export cancelled."
    Else
        Dim picks As Collection
        Set picks = frmGapExport.SelectedDisplays
        ' mixed base currencies among the picks -> export in a common currency (EUR)
        If Len(DisplayCurrency()) = 0 And DisplaysMixedCurrency(picks) Then DefaultToEurForConversion
        SetStatus "Generating the Gap Comparison Report (" & picks.Count & " costbooks)..."
        DoEvents
        Dim rowsCol As Collection, labelsCol As Collection, infoCol As Collection
        If Not CollectCarlinesFromDisplays(picks, rowsCol, labelsCol, infoCol) Then
            SetStatus "The selected costbooks have no rows to compare."
        Else
            ExtractGapReport ApplySplitFilter(rowsCol), labelsCol, infoCol, SplitLabel(), Sel(cboLevel)
            SetStatus "Gap Comparison Report generated in a new (unsaved) workbook - it's now the active window."
        End If
    End If
    Unload frmGapExport
End Sub

'================================ REFRESH ======================================
' Index row (1-based) in mCostbooks whose display label equals txt, 0 when none.
' Text-based (not ListIndex-based) so typed-in selections resolve too.
Private Function RowOfDisplay(ByVal txt As String) As Long
    Dim i As Long
    If Not IsArray(mCostbooks) Then Exit Function
    If Len(txt) = 0 Then Exit Function
    For i = 1 To UBound(mCostbooks, 1)
        If StrComp(CStr(mCostbooks(i, CI_DISPLAY)), txt, vbTextCompare) = 0 Then
            RowOfDisplay = i
            Exit Function
        End If
    Next i
End Function

Private Function SelectedCostbookRow() As Long
    SelectedCostbookRow = RowOfDisplay(Trim$(cboCostbook.value & ""))
End Function

' Index row of one car combo's selection ("(none)" / empty = 0).
Private Function CarRow(ByVal cbo As MSForms.ComboBox) As Long
    Dim T As String
    T = Trim$(cbo.value & "")
    If StrComp(T, "(none)", vbTextCompare) = 0 Then Exit Function
    CarRow = RowOfDisplay(T)
End Function

' True when the selected page-2 carlines don't all share one base currency (so a
' no-conversion comparison would mix currencies).
Private Function SelectedCarsMixedCurrency() As Boolean
    Dim cbos As Variant, i As Long, r As Long, cur As String, c As String, cnt As Long
    cbos = Array(cboCar1, cboCar2, cboCar3)
    For i = 0 To 2
        r = CarRow(cbos(i))
        If r > 0 Then
            c = CarlineCurrency(CStr(mCostbooks(r, CI_VEHICLE)))
            cnt = cnt + 1
            If cnt = 1 Then
                cur = c
            ElseIf StrComp(cur, c, vbTextCompare) <> 0 Then
                SelectedCarsMixedCurrency = True
                Exit Function
            End If
        End If
    Next i
End Function

' True when the costbooks behind an ordered list of display labels (the export
' picks) don't all share one base currency.
Private Function DisplaysMixedCurrency(ByVal picks As Collection) As Boolean
    Dim i As Long, r As Long, cur As String, c As String, cnt As Long
    If picks Is Nothing Then Exit Function
    For i = 1 To picks.Count
        r = RowOfDisplay(CStr(picks(i)))
        If r > 0 Then
            c = CarlineCurrency(CStr(mCostbooks(r, CI_VEHICLE)))
            cnt = cnt + 1
            If cnt = 1 Then
                cur = c
            ElseIf StrComp(cur, c, vbTextCompare) <> 0 Then
                DisplaysMixedCurrency = True
                Exit Function
            End If
        End If
    Next i
End Function

' Relabels the first ("no conversion") combo entry with the current context's actual
' source currency, e.g. "(Source currency: EUR)" - so the user sees WHICH currency
' the un-converted values are in. cur = "" falls back to the generic label.
Private Sub UpdateSourceCurrencyItem(ByVal cur As String)
    On Error Resume Next
    If cboCurrency.ListCount = 0 Then Exit Sub
    Dim lbl As String: lbl = SourceCurrencyChoice(cur)
    If StrComp(CStr(cboCurrency.List(0)), lbl, vbBinaryCompare) = 0 Then Exit Sub   ' unchanged
    Dim wasSel As Boolean: wasSel = (cboCurrency.ListIndex = 0)
    Dim prev As Boolean: prev = mLoading
    mLoading = True
    cboCurrency.List(0) = lbl
    If wasSel Then                        ' keep it selected + in sync when it's the active choice
        cboCurrency.ListIndex = 0
        SetTargetCurrency lbl
    End If
    mLoading = prev
    On Error GoTo 0
End Sub

' Switches the display currency to EUR (updating the selector) when not already
' converting - so a mixed-currency comparison is exported in a common currency.
Private Sub DefaultToEurForConversion()
    mLoading = True
    On Error Resume Next
    cboCurrency.value = "EUR"
    On Error GoTo 0
    SetTargetCurrency "EUR"
    mLoading = False
End Sub

' Base-currency code shared by a set of carlines (veh codes), or "mixed" when they
' differ / "" when unknown - used to name the currency when NOT converting.
Private Function SourceCurrencyLabel(ByVal labelsCol As Collection) As String
    If labelsCol Is Nothing Then Exit Function
    Dim i As Long, cur As String, c As String
    For i = 1 To labelsCol.Count
        c = CarlineCurrency(CStr(labelsCol(i)))
        If i = 1 Then
            cur = c
        ElseIf StrComp(cur, c, vbTextCompare) <> 0 Then
            SourceCurrencyLabel = "mixed": Exit Function
        End If
    Next i
    SourceCurrencyLabel = cur
End Function

'============================ Data Explorer (page 3) ===========================
' The 7 explorer filter values, aligned to modCostbookData.ExplorerFilterCols().
' Each is "(All)" or one/several checked values joined with FILTER_SEP.
Private Function ExplorerFilterValues() As Variant
    ExplorerFilterValues = Array(mfExRegion.value, mfExProject.value, mfExMilestone.value, _
        mfExType.value, mfExPlatform.value, mfExPtrain.value, mfExCarline.value)
End Function

' Repopulates the 7 explorer filters, each restricted by the OTHER six (cascading),
' preserving current selections. Runs under the caller's guard.
Private Sub PopulateExplorerFilters()
    Dim f As Variant: f = ExplorerFilterValues()
    mfExRegion.SetItems ExplorerDistinct(CI_REGION, f)
    mfExProject.SetItems ExplorerDistinct(CI_PROJECT, f)
    mfExMilestone.SetItems ExplorerDistinct(CI_MILESTONE, f)
    mfExType.SetItems ExplorerDistinct(CI_TYPE, f)
    mfExPlatform.SetItems ExplorerDistinct(CI_PLATFORM, f)
    mfExPtrain.SetItems ExplorerDistinct(CI_PTRAIN, f)
    mfExCarline.SetItems ExplorerDistinct(CI_VEHICLE, f)
End Sub

Private Sub RefreshPage3()
    If mBusy Then mKeyP3 = vbNullChar: Exit Sub  ' re-entered through a DoEvents

    Dim key As String
    key = Join(ExplorerFilterValues(), "|")
    If key = mKeyP3 Then Exit Sub
    mKeyP3 = key

    mExData = ExplorerData(ExplorerFilterValues())
    FillExplorerList mExData

    Dim n As Long
    If IsArray(mExData) Then n = UBound(mExData, 1)
    fraBody.Controls("capExplorer").caption = "Costbook records  (" & n & ")"
    If n = 0 Then
        SetStatus "No costbook records match the filters."
    Else
        SetStatus n & " costbook record(s). Select one and " & ChrW(8595) & _
                  " Open source file (or double-click a row) to download the original."
    End If
End Sub

' Fills lstExplorer from an ExplorerData array (EX_ layout) into the 10-column
' on-form list (see ExplorerHeaders). The Source File URL is NOT shown - it is kept
' in mExUrls (aligned to the rows) and opened on selection (button / double-click).
Private Sub FillExplorerList(ByVal data As Variant)
    lstExplorer.Clear
    Erase mExUrls
    If Not IsArray(data) Then Exit Sub
    Dim n As Long: n = UBound(data, 1)
    ReDim mExUrls(0 To n - 1)

    Dim i As Long, rw As Long
    For i = 1 To n
        lstExplorer.AddItem CStr(data(i, EX_REGION) & "")        ' col 0
        rw = lstExplorer.ListCount - 1
        lstExplorer.List(rw, 1) = CStr(data(i, EX_PROJECT) & "")
        lstExplorer.List(rw, 2) = CStr(data(i, EX_CARLINE) & "")
        lstExplorer.List(rw, 3) = CStr(data(i, EX_MILESTONE) & "")
        lstExplorer.List(rw, 4) = CStr(data(i, EX_MSDATE) & "")
        lstExplorer.List(rw, 5) = CStr(data(i, EX_PHASE) & "")
        lstExplorer.List(rw, 6) = CStr(data(i, EX_CURRENCY) & "")
        lstExplorer.List(rw, 7) = FmtSpace(CDbl(data(i, EX_TPC)), 0)
        lstExplorer.List(rw, 8) = CStr(data(i, EX_PCP) & "")
        lstExplorer.List(rw, 9) = CStr(data(i, EX_REFPERSON) & "")
        mExUrls(rw) = CStr(data(i, EX_URL) & "")
    Next i
End Sub

' Page-3 export: the filtered records list to a new workbook (Source File as
' clickable hyperlinks - the reliable way to download the originals).
Private Sub RunExplorerExport()
    If Not IsArray(mExData) Then
        SetStatus "No records to export."
        Exit Sub
    End If
    SetStatus "Exporting the costbook records list..."
    DoEvents
    ExtractExplorerList mExData
    SetStatus "Records list exported to a new (unsaved) workbook - Source File cells are clickable links."
End Sub

Private Sub RefreshPage1()
    ' A render is already running and DoEvents let this click through: drop it, and
    ' void the render key so the NEXT event re-renders instead of matching a key
    ' that describes a selection this run never drew.
    If mBusy Then mKeyP1 = vbNullChar: Exit Sub

    Dim r As Long: r = SelectedCostbookRow()

    Dim key As String
    key = Trim$(cboCostbook.value & "") & "|" & r
    If key = mKeyP1 Then Exit Sub                ' nothing changed - skip re-render
    mKeyP1 = key

    ' name the selected costbook's source currency on the "no conversion" entry
    If r > 0 Then
        UpdateSourceCurrencyItem CStr(mCostbooks(r, CI_CURRENCY) & "")
    Else
        UpdateSourceCurrencyItem vbNullString
    End If

    If r = 0 Then
        ShowPreview Nothing, imgBars, lblBarsPh
        ShowPreview Nothing, imgPie, lblPiePh
        lstSystems.Clear: lstParts.Clear
        SetStatus "Select a costbook."
        Exit Sub
    End If

    ' NOT captured-and-restored. Restoring a CAPTURED value is a ratchet: once
    ' ScreenUpdating is False for any reason - an untrapped error, a manual End in
    ' the VBE - the capture reads False and the restore puts False back, for every
    ' render, for ever. Excel then never repaints: workbooks open invisibly, closes
    ' look dead and the pointer spins, and closing the form does not clear it.
    ' These are top-level UI handlers, never nested helpers, so the correct value to
    ' end on is simply True (see RestoreExcelUI).
    Dim scratch As Worksheet
    TrcIn "RefreshPage1", key
    Application.ScreenUpdating = False: Application.EnableEvents = False
    mBusy = True                                 ' ShowPreview's DoEvents starts here
    On Error GoTo CleanUp
    SetStatus "Rendering..."

    Dim rows As Variant
    rows = GetCostbookRows(CStr(mCostbooks(r, CI_VEHICLE)), _
                           CStr(mCostbooks(r, CI_MILESTONE)), _
                           CStr(mCostbooks(r, CI_DATEKEY)))
    If Not IsArray(rows) Then
        ShowPreview Nothing, imgBars, lblBarsPh
        ShowPreview Nothing, imgPie, lblPiePh
        lstSystems.Clear: lstParts.Clear
        SetStatus "No rows for """ & mCostbooks(r, CI_DISPLAY) & """."
        GoTo CleanUp
    End If

    ' render at the preview controls' width so the vector paste is 1:1 crisp
    Set scratch = BeginTemp()
    Dim g As Object
    Set g = BuildCostBarsGroup(scratch, 15, 15, imgBars.width - 4, rows)
    ShowPreview g, imgBars, lblBarsPh
    Set g = BuildCostPieGroup(scratch, 15, 15 + imgBars.width * 0.52 + 40, imgPie.width - 4, rows)
    ShowPreview g, imgPie, lblPiePh

    FillParetoList lstSystems, TopN(ParetoAgg(rows, CB_L2), 10)
    FillParetoList lstParts, TopN(ParetoAgg(rows, CB_NORMPART), 10)

    Dim disp As String: disp = DisplayCurrency()
    Dim shown As String
    If Len(disp) > 0 Then shown = disp Else shown = CStr(mCostbooks(r, CI_CURRENCY) & "")
    SetStatus "Total TPC: " & FmtSpace(TotalTPC(rows), 0) & _
              IIf(Len(shown) > 0, " " & shown, "") & _
              "   |   " & mCostbooks(r, CI_DISPLAY) & _
              IIf(Len(disp) > 0, "   (converted to " & disp & ")", "   (no conversion)")
CleanUp:
    ' Read Err BEFORE the On Error below: any On Error statement resets the Err object,
    ' so a handler that starts with "On Error Resume Next" can never report what it caught.
    If Err.Number <> 0 Then TrcAlert "RefreshPage1 error " & Err.Number & ": " & Err.Description
    On Error Resume Next
    EndTemp scratch             ' releases the clipboard BEFORE deleting the shapes
    RestoreExcelUI
    mBusy = False
    On Error GoTo 0
    TrcOut "RefreshPage1", IIf(mCloseRequested, "close pending", "")
    HonorPendingClose           ' the user clicked Close while this render was running
End Sub

' Gathers the 2..3 selected page-2 carlines (distinct). False when fewer than 2.
Private Function CollectCarlines(ByRef rowsCol As Collection, ByRef labelsCol As Collection) As Boolean
    Set rowsCol = New Collection
    Set labelsCol = New Collection
    Dim seen As Object: Set seen = CreateObject("Scripting.Dictionary")

    Dim cbos As Variant, i As Long, r As Long
    cbos = Array(cboCar1, cboCar2, cboCar3)
    For i = 0 To 2
        r = CarRow(cbos(i))
        If r > 0 Then
            If Not seen.Exists(CStr(r)) Then
                seen.Add CStr(r), True
                Dim rows As Variant
                rows = GetCostbookRows(CStr(mCostbooks(r, CI_VEHICLE)), _
                                       CStr(mCostbooks(r, CI_MILESTONE)), _
                                       CStr(mCostbooks(r, CI_DATEKEY)))
                If IsArray(rows) Then
                    rowsCol.Add rows
                    labelsCol.Add CStr(mCostbooks(r, CI_VEHICLE))
                End If
            End If
        End If
    Next i
    CollectCarlines = (rowsCol.Count >= 2)
End Function

' Resolves an ordered Collection of display labels (from frmGapExport, Baseline
' first, 2..5 items) into rows / label / attribute collections for the Gap
' Comparison Report. infoCol items are 1D arrays of the CI_ index fields.
Private Function CollectCarlinesFromDisplays(ByVal picks As Collection, _
        ByRef rowsCol As Collection, ByRef labelsCol As Collection, _
        ByRef infoCol As Collection) As Boolean
    Set rowsCol = New Collection
    Set labelsCol = New Collection
    Set infoCol = New Collection

    Dim i As Long, r As Long, j As Long
    For i = 1 To picks.Count
        r = RowOfDisplay(CStr(picks(i)))
        If r > 0 Then
            Dim rows As Variant
            rows = GetCostbookRows(CStr(mCostbooks(r, CI_VEHICLE)), _
                                   CStr(mCostbooks(r, CI_MILESTONE)), _
                                   CStr(mCostbooks(r, CI_DATEKEY)))
            If IsArray(rows) Then
                rowsCol.Add rows
                labelsCol.Add CStr(mCostbooks(r, CI_VEHICLE))
                Dim att() As Variant
                ReDim att(1 To CI_COLS)
                For j = 1 To CI_COLS: att(j) = mCostbooks(r, j): Next j
                infoCol.Add att
            End If
        End If
    Next i
    CollectCarlinesFromDisplays = (rowsCol.Count >= 2)
End Function

' Human-readable form of the 5th Split selection: "(All)", the single value, or
' "A, B, C". The raw Value packs several values with FILTER_SEP (a vbLf), which
' must never reach a caption, a status line or a report header.
Private Function SplitLabel() As String
    SplitLabel = Replace(mfSplit.value, FILTER_SEP, ", ")
End Function

' Applies the "Split Selection" (any number of 5th values, or "(All)") to every
' carline's rows. Items stay aligned with the labels collection: a carline with no
' rows for that split keeps its slot (Empty item -> zero total in the charts/tables).
Private Function ApplySplitFilter(ByVal rowsCol As Collection) As Collection
    Dim res As New Collection, i As Long, flt As String
    flt = mfSplit.value
    For i = 1 To rowsCol.Count
        res.Add FilterRowsBy(rowsCol(i), CB_FIFTH, flt)
    Next i
    Set ApplySplitFilter = res
End Function

Private Sub RefreshPage2()
    If mBusy Then mKeyP2 = vbNullChar: Exit Sub  ' re-entered through a DoEvents

    ' comparing carlines in different base currencies only makes sense in a common
    ' currency: default to EUR when they're mixed and no target was chosen yet
    If Len(DisplayCurrency()) = 0 And SelectedCarsMixedCurrency() Then
        DefaultToEurForConversion
        mKeyP2 = vbNullChar                      ' force the render below to run
    End If

    Dim key As String
    key = Trim$(cboCar1.value & "") & "|" & Trim$(cboCar2.value & "") & "|" & _
          Trim$(cboCar3.value & "") & "|" & Sel(cboLevel) & "|" & mfSplit.value
    If key = mKeyP2 Then Exit Sub                ' nothing changed - skip re-render
    mKeyP2 = key

    Dim splitFlt As String: splitFlt = SplitLabel()
    lblGapSplitTitle.caption = "Gap by 5th" & _
        IIf(splitFlt <> FILTER_ALL, "  [Split: " & splitFlt & "]", "")
    lblGapTopTitle.caption = "Top 10 by Absolute Gap [" & Sel(cboLevel) & "]"

    Dim rowsCol As Collection, labelsCol As Collection
    If Not CollectCarlines(rowsCol, labelsCol) Then
        ShowPreview Nothing, imgWaterfall, lblWaterPh
        lstGapSplit.Clear: lstGapTop.Clear
        SetStatus "Select at least two different carlines (V1 + V2)."
        Exit Sub
    End If

    ' name the carlines' shared source currency on the "no conversion" entry (the
    ' generic label when they are mixed - a common currency is needed there anyway)
    Dim sc As String: sc = SourceCurrencyLabel(labelsCol)
    If StrComp(sc, "mixed", vbTextCompare) = 0 Then sc = vbNullString
    UpdateSourceCurrencyItem sc

    Set rowsCol = ApplySplitFilter(rowsCol)      ' restrict to the picked 5th value

    ' NOT captured-and-restored. Restoring a CAPTURED value is a ratchet: once
    ' ScreenUpdating is False for any reason - an untrapped error, a manual End in
    ' the VBE - the capture reads False and the restore puts False back, for every
    ' render, for ever. Excel then never repaints: workbooks open invisibly, closes
    ' look dead and the pointer spins, and closing the form does not clear it.
    ' These are top-level UI handlers, never nested helpers, so the correct value to
    ' end on is simply True (see RestoreExcelUI).
    Dim scratch As Worksheet
    TrcIn "RefreshPage2", key
    Application.ScreenUpdating = False: Application.EnableEvents = False
    mBusy = True                                 ' ShowPreview's DoEvents starts here
    On Error GoTo CleanUp
    SetStatus "Rendering..."

    Set scratch = BeginTemp()
    Dim g As Object
    Set g = BuildWaterfallGroup(scratch, 15, 15, imgWaterfall.width - 4, rowsCol, labelsCol, Sel(cboLevel))
    ShowPreview g, imgWaterfall, lblWaterPh
    If g Is Nothing Then SetStatus "No rows for the selected carlines" & _
        IIf(splitFlt <> FILTER_ALL, " with split """ & splitFlt & """", "") & "."

    FillGapList lstGapSplit, GapAgg(rowsCol, CB_FIFTH), rowsCol.Count, 0
    FillGapList lstGapTop, GapAgg(rowsCol, LevelCol(Sel(cboLevel))), rowsCol.Count, 10

    Dim cur2 As String: cur2 = DisplayCurrency()
    If Len(cur2) = 0 Then cur2 = SourceCurrencyLabel(labelsCol)     ' base code, or "mixed"
    SetStatus "Comparing " & rowsCol.Count & " carlines by " & Sel(cboLevel) & _
              IIf(splitFlt <> FILTER_ALL, "  [Split: " & splitFlt & "]", "") & _
              IIf(Len(cur2) > 0, "  [" & cur2 & "]", "") & "."
CleanUp:
    If Err.Number <> 0 Then TrcAlert "RefreshPage2 error " & Err.Number & ": " & Err.Description
    On Error Resume Next
    EndTemp scratch             ' releases the clipboard BEFORE deleting the shapes
    RestoreExcelUI
    mBusy = False
    On Error GoTo 0
    TrcOut "RefreshPage2", IIf(mCloseRequested, "close pending", "")
    HonorPendingClose
End Sub

'------------------------------ list fillers -----------------------------------
' agg: label | TPC | TPC % | cum %  ->  4 columns, formatted like the drafts.
Private Sub FillParetoList(ByVal lst As MSForms.ListBox, ByVal agg As Variant)
    lst.Clear
    If Not IsArray(agg) Then Exit Sub
    SetListWidths lst, 4
    Dim i As Long
    For i = 1 To UBound(agg, 1)
        lst.AddItem CStr(agg(i, 1))
        lst.List(lst.ListCount - 1, 1) = FmtSpace(CDbl(agg(i, 2)), 0)
        lst.List(lst.ListCount - 1, 2) = FmtSpace(CDbl(agg(i, 3)) * 100#, 0) & "%"
        lst.List(lst.ListCount - 1, 3) = FmtSpace(CDbl(agg(i, 4)) * 100#, 0) & "%"
    Next i
End Sub

' agg: label | v1..vn | gap | gap %. maxRows = 0 -> all.
Private Sub FillGapList(ByVal lst As MSForms.ListBox, ByVal agg As Variant, _
        ByVal nc As Long, ByVal maxRows As Long)
    lst.Clear
    If Not IsArray(agg) Then Exit Sub
    lst.ColumnCount = nc + 3
    SetListWidths lst, nc + 3
    Dim n As Long, i As Long, j As Long
    n = UBound(agg, 1)
    If maxRows > 0 And maxRows < n Then n = maxRows
    For i = 1 To n
        lst.AddItem CStr(agg(i, 1))
        For j = 1 To nc + 1
            lst.List(lst.ListCount - 1, j) = FmtSpace(CDbl(agg(i, j + 1)), 0)
        Next j
        If IsNumeric(agg(i, nc + 3)) Then
            lst.List(lst.ListCount - 1, nc + 2) = FmtSpace(CDbl(agg(i, nc + 3)) * 100#, 0) & "%"
        Else
            lst.List(lst.ListCount - 1, nc + 2) = "-"
        End If
    Next i
End Sub

'------------------------------ preview plumbing --------------------------------
' Copies a grouped shape into an Image control via the clipboard (vector EMF).
' Retries; keeps the previous picture when every try fails (stale-clipboard quirk).
Private Sub ShowPreview(ByVal grp As Object, ByVal img As MSForms.image, ByVal ph As MSForms.label)
    If grp Is Nothing Then
        On Error Resume Next
        Set img.Picture = Nothing
        On Error GoTo 0
        ph.Visible = img.Visible
        ph.ZOrder 0
        Exit Sub
    End If
    TrcIn "ShowPreview", img.name
    Dim pic As stdole.IPicture, try As Long
    For try = 1 To 3
        ClearClipboard 5, False     ' False = no DoEvents: never pump inside a render
        On Error Resume Next
        grp.CopyPicture 1, -4147                    ' xlScreen, xlPicture
        On Error GoTo 0
        Trc "CopyPicture", "try " & try & " - OWN must read OURS from here"
        DoEvents
        Set pic = PastePicture()
        If Not pic Is Nothing Then Exit For
    Next try
    If Not pic Is Nothing Then
        Set img.Picture = pic
        ph.Visible = False
    End If

    ' Hand the clipboard back. PastePicture already owns an independent copy of the
    ' metafile (CopyEnhMetaFile), so nothing here needs the clipboard any more - but
    ' Excel would otherwise keep advertising a delayed-render picture whose source
    ' shapes EndTemp is about to DELETE off the scratch sheet. Excel then tries to
    ' realise that dead source the next time anything flushes the clipboard - which
    ' is exactly what closing a workbook does, and it is why a generated report
    ' window would sit there with a spinning pointer instead of closing.
    '
    ' ReleaseClipboard (not the old CutCopyMode + ClearClipboard pair): CutCopyMode
    ' cancels a RANGE copy only, and user32's EmptyClipboard drops the CONTENTS while
    ' ole32 keeps holding Excel's IDataObject - the half-release that left the promise
    ' alive. ReleaseClipboard revokes the OLE offer first and then VERIFIES that this
    ' process no longer owns the clipboard. pump:=False - no DoEvents inside a render.
    On Error Resume Next
    If Not ReleaseClipboard(False) Then
        ' Not fatal for this preview (the picture is already ours), but it means a
        ' promise may still be outstanding when EndTemp deletes the shapes. Say so
        ' rather than let it surface an hour later as a workbook that won't close.
        TrcAlert "ShowPreview: clipboard NOT released after CopyPicture."
        SetStatus "Warning: the clipboard could not be released - if a workbook " & _
                  "later refuses to close, run TpcReset."
    End If
    On Error GoTo 0

    ' Force the new picture to paint NOW. MSForms (esp. an Image inside a Frame,
    ' rendered while ScreenUpdating = False) often defers the repaint until the
    ' next mouse-move; repainting the parent frame makes the change appear at once.
    On Error Resume Next
    img.parent.Repaint
    On Error GoTo 0
    TrcOut "ShowPreview", IIf(pic Is Nothing, "NO PICTURE", "ok")
End Sub

'------------------------------ PNG export -------------------------------------
' Rebuilds the selected page-1 chart at export resolution and writes it to a PNG
' the user picks (which = "bars" or "pie"). Mirrors RefreshPage1's render path so
' the file matches the preview exactly.
Private Sub SavePngPage1(ByVal which As String)
    If mBusy Then Exit Sub                       ' a render / export is already running
    Dim r As Long: r = SelectedCostbookRow()
    If r = 0 Then SetStatus "Select a costbook first.": Exit Sub

    Dim rows As Variant
    rows = GetCostbookRows(CStr(mCostbooks(r, CI_VEHICLE)), _
                           CStr(mCostbooks(r, CI_MILESTONE)), _
                           CStr(mCostbooks(r, CI_DATEKEY)))
    If Not IsArray(rows) Then SetStatus "No rows to export.": Exit Sub

    Dim path As Variant
    path = PickPngPath(SafeName(CStr(mCostbooks(r, CI_VEHICLE))) & _
                       IIf(which = "pie", "_TPC_by_5th", "_TPC_by_L1") & ".png")
    If VarType(path) = vbBoolean Then SetStatus "PNG export cancelled.": Exit Sub

    ' NOT captured-and-restored. Restoring a CAPTURED value is a ratchet: once
    ' ScreenUpdating is False for any reason - an untrapped error, a manual End in
    ' the VBE - the capture reads False and the restore puts False back, for every
    ' render, for ever. Excel then never repaints: workbooks open invisibly, closes
    ' look dead and the pointer spins, and closing the form does not clear it.
    ' These are top-level UI handlers, never nested helpers, so the correct value to
    ' end on is simply True (see RestoreExcelUI).
    Dim scratch As Worksheet
    TrcIn "SavePngPage1", which
    Application.ScreenUpdating = False: Application.EnableEvents = False
    mBusy = True                                 ' the clipboard round-trip starts here
    On Error GoTo CleanUp
    SetStatus "Exporting PNG..."

    Set scratch = BeginTemp()
    Dim g As Object
    If which = "pie" Then
        Set g = BuildCostPieGroup(scratch, 15, 15, EXPORT_W, rows)
    Else
        Set g = BuildCostBarsGroup(scratch, 15, 15, EXPORT_W, rows)
    End If
    ReportPng ExportGroupPng(scratch, g, CStr(path)), CStr(path)
CleanUp:
    If Err.Number <> 0 Then TrcAlert "SavePngPage1 error " & Err.Number & ": " & Err.Description
    On Error Resume Next
    EndTemp scratch             ' releases the clipboard BEFORE deleting the shapes
    RestoreExcelUI
    mBusy = False
    On Error GoTo 0
    TrcOut "SavePngPage1"
    HonorPendingClose
End Sub

' Rebuilds the page-2 waterfall at export resolution and writes it to a PNG.
Private Sub SavePngPage2()
    If mBusy Then Exit Sub                       ' a render / export is already running
    Dim rowsCol As Collection, labelsCol As Collection
    If Not CollectCarlines(rowsCol, labelsCol) Then
        SetStatus "Select at least two different carlines (V1 + V2) first."
        Exit Sub
    End If
    Set rowsCol = ApplySplitFilter(rowsCol)

    Dim path As Variant
    path = PickPngPath("TPC_Walk_" & SafeName(labelsCol(1)) & "_vs_" & _
                       SafeName(labelsCol(labelsCol.Count)) & ".png")
    If VarType(path) = vbBoolean Then SetStatus "PNG export cancelled.": Exit Sub

    ' NOT captured-and-restored. Restoring a CAPTURED value is a ratchet: once
    ' ScreenUpdating is False for any reason - an untrapped error, a manual End in
    ' the VBE - the capture reads False and the restore puts False back, for every
    ' render, for ever. Excel then never repaints: workbooks open invisibly, closes
    ' look dead and the pointer spins, and closing the form does not clear it.
    ' These are top-level UI handlers, never nested helpers, so the correct value to
    ' end on is simply True (see RestoreExcelUI).
    Dim scratch As Worksheet
    TrcIn "SavePngPage2"
    Application.ScreenUpdating = False: Application.EnableEvents = False
    mBusy = True                                 ' the clipboard round-trip starts here
    On Error GoTo CleanUp
    SetStatus "Exporting PNG..."

    Set scratch = BeginTemp()
    Dim g As Object
    Set g = BuildWaterfallGroup(scratch, 15, 15, EXPORT_W, rowsCol, labelsCol, Sel(cboLevel))
    ReportPng ExportGroupPng(scratch, g, CStr(path)), CStr(path)
CleanUp:
    If Err.Number <> 0 Then TrcAlert "SavePngPage2 error " & Err.Number & ": " & Err.Description
    On Error Resume Next
    EndTemp scratch             ' releases the clipboard BEFORE deleting the shapes
    RestoreExcelUI
    mBusy = False
    On Error GoTo 0
    TrcOut "SavePngPage2"
    HonorPendingClose
End Sub

' Prompts for a PNG destination; returns the path, or False if cancelled.
Private Function PickPngPath(ByVal dfltName As String) As Variant
    PickPngPath = Application.GetSaveAsFilename( _
        InitialFileName:=dfltName, _
        FileFilter:="PNG image (*.png), *.png", _
        Title:="Save chart as PNG")
End Function

' Strips characters Windows won't allow in a file name.
Private Function SafeName(ByVal s As String) As String
    Dim bad As Variant, i As Long
    bad = Array("\", "/", ":", "*", "?", """", "<", ">", "|")
    For i = LBound(bad) To UBound(bad)
        s = Replace(s, CStr(bad(i)), "_")
    Next i
    s = Trim$(s)
    If Len(s) = 0 Then s = "chart"
    SafeName = s
End Function

Private Sub ReportPng(ByVal ok As Boolean, ByVal path As String)
    If ok Then
        SetStatus "Saved PNG: " & path
    Else
        SetStatus "PNG export failed (nothing to render, or the file is locked)."
    End If
End Sub

' Puts Excel's UI back in a usable state after a render / export. Always sets the
' flags ON - never to a captured previous value, for the ratchet reason spelled out
' at each capture site. Called from every CleanUp block, and it is the only place
' these get turned back on.
Private Sub RestoreExcelUI()
    On Error Resume Next
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    Application.DisplayAlerts = True
    On Error GoTo 0
End Sub

Private Sub SetStatus(ByVal msg As String)
    On Error Resume Next
    lblStatus.caption = msg
    Me.Repaint                 ' show the status immediately (no mouse-move needed)
    On Error GoTo 0
End Sub

