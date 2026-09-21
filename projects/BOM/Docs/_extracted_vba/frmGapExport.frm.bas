Attribute VB_Name = "frmGapExport"
Attribute VB_Base = "0{1D7FA26D-99DC-4344-94FA-768147E7DDD2}{E586B213-3A62-4DE6-B4CE-6ABF780C288A}"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Attribute VB_TemplateDerived = False
Attribute VB_Customizable = False
'==================================================================================
' frmGapExport  -  popup carline picker for the "Export Gap Comparison Report"
' action on the Comparative Analysis page (built 100% in code, like frmCostbooks).
'
' *** SETUP (this file is NOT importable - the layout is code-built): ***
'   VBA IDE -> Insert -> UserForm; set (Name) = frmGapExport (leave it empty),
'   then View Code (F7) and paste this WHOLE file in - or simply run
'   modUpdateModules.RefreshModulesFromFolder, which injects every form .txt.
'
' Flow (driven by frmCostbooks.btnExtract on page 2):
'   frmGapExport.InitPicks displays, n, currentPicks   ' costbook list + prefill
'   frmGapExport.Show                                  ' modal
'   If Not frmGapExport.Cancelled Then ... frmGapExport.SelectedDisplays ...
'   Unload frmGapExport
'
' Five type-ahead dropdowns (Vehicle | Milestone | Date): the first is the
' Baseline, so the report can compare up to 5 costbooks (the up-to-3 picks made
' on the page are prefilled). Duplicates and empty slots are skipped.
'==================================================================================
Option Explicit

'---------------------------------- palette ------------------------------------
Private Const NAVY As Long = 6893343        ' RGB(31, 47, 105)
Private Const GRAYTXT As Long = 9868950     ' RGB(150,150,150)
Private Const CARD_FILL As Long = 16578550  ' RGB(246,248,252)
Private Const CARD_LINE As Long = 14795700  ' RGB(180,195,225)

Private Const MAX_CARS As Long = 5

'------------------------------ event controls ---------------------------------
Private WithEvents btnOk As MSForms.CommandButton
Attribute btnOk.VB_VarHelpID = -1
Private WithEvents btnCancel As MSForms.CommandButton
Attribute btnCancel.VB_VarHelpID = -1

'------------------------------ passive controls -------------------------------
Private mCbo(1 To MAX_CARS) As MSForms.ComboBox
Private lblStatus As MSForms.label

'---------------------------------- state --------------------------------------
Private mCancelled As Boolean        ' True until "Generate report" is clicked

'================================ lifecycle ====================================
Private Sub UserForm_Initialize()
    mCancelled = True

    Const W As Single = 560
    Const H As Single = 372
    Dim wl As Single, wt As Single, ww As Single, wh As Single
    GetWorkAreaPt wl, wt, ww, wh
    Me.StartUpPosition = 0
    If ww > 300 And wh > 300 Then
        Me.Left = wl + (ww - W) / 2
        Me.top = wt + (wh - H) / 2
    Else
        Me.Left = 200: Me.top = 150
    End If
    Me.width = W: Me.Height = H
    Me.caption = "Export Gap Comparison Report"
    Me.BackColor = vbWhite

    BuildUI
End Sub

' Closing with [X] counts as Cancel (hide, don't unload, so the caller can still
' read Cancelled / SelectedDisplays afterwards).
Private Sub UserForm_QueryClose(Cancel As Integer, CloseMode As Integer)
    If CloseMode = vbFormControlMenu Then
        Cancel = 1
        mCancelled = True
        Me.Hide
    End If
End Sub

'================================ UI BUILD =====================================
Private Sub BuildUI()
    Const m As Single = 12
    Dim W As Single: W = Me.InsideWidth

    '---- header band ----------------------------------------------------------
    AddBand "bandHeader", 0, 0, W, 46, NAVY
    With AddLabel(Me, "lblTitle", "Export Gap Comparison Report", m, 6, W - 2 * m, 16)
        .ForeColor = vbWhite
        .font.bold = True
        .font.Size = 12
    End With
    With AddLabel(Me, "lblSub", "Compare up to " & MAX_CARS & _
                  " costbooks - the first one is the Baseline", m, 26, W - 2 * m, 12)
        .ForeColor = RGB(200, 210, 240)
        .font.Size = 8.5
    End With

    '---- picker card ----------------------------------------------------------
    Dim cTop As Single: cTop = 58
    Dim cH As Single: cH = 30 + MAX_CARS * 27 + 8
    With AddLabel(Me, "cardPicks", "", m, cTop, W - 2 * m, cH)
        .BackStyle = fmBackStyleOpaque
        .BackColor = CARD_FILL
        .BorderStyle = fmBorderStyleSingle
        .BorderColor = CARD_LINE
    End With
    With AddLabel(Me, "lblCard", "Costbooks (Vehicle | Milestone | Date)", m + 8, cTop + 5, 260, 12)
        .ForeColor = NAVY
        .font.bold = True
        .font.Size = 8.5
    End With

    Dim i As Long, y As Single
    For i = 1 To MAX_CARS
        y = cTop + 26 + (i - 1) * 27
        With AddLabel(Me, "lblCar" & i, IIf(i = 1, "Baseline (V1):", "Vehicle " & i & ":"), _
                      m + 8, y + 3, 82, 12)
            .ForeColor = NAVY
            .font.Size = 8.5
            If i = 1 Then .font.bold = True
        End With
        Set mCbo(i) = Me.Controls.Add("Forms.ComboBox.1", "cboCar" & i, True)
        With mCbo(i)
            .Left = m + 96: .top = y: .width = W - 2 * m - 104: .Height = 18
            .style = fmStyleDropDownCombo
            .MatchEntry = fmMatchEntryComplete
            .font.name = "Segoe UI"
            .font.Size = 8.5
        End With
    Next i

    With AddLabel(Me, "lblNote", "*At least 2 costbooks - duplicates and empty slots are skipped.", _
                  m, cTop + cH + 5, W - 2 * m, 12)
        .ForeColor = vbRed
        .font.Size = 7.5
    End With

    '---- action row -----------------------------------------------------------
    Dim bTop As Single: bTop = Me.InsideHeight - 34
    Set lblStatus = AddLabel(Me, "lblStatus", "Ready.", m, bTop + 5, W - 2 * m - 210, 14)
    lblStatus.ForeColor = GRAYTXT

    Set btnCancel = AddButton("btnCancel", "Cancel", W - m - 196, bTop, 70, 24, False)
    Set btnOk = AddButton("btnOk", "Generate report", W - m - 118, bTop, 118, 24, True)
End Sub

'------------------------------ control factories ------------------------------
Private Function AddBand(ByVal nm As String, ByVal L As Single, ByVal T As Single, _
        ByVal W As Single, ByVal H As Single, ByVal color As Long) As MSForms.label
    Dim c As MSForms.label
    Set c = Me.Controls.Add("Forms.Label.1", nm, True)
    c.Left = L: c.top = T: c.width = W: c.Height = H
    c.BackStyle = fmBackStyleOpaque
    c.BackColor = color
    c.caption = ""
    Set AddBand = c
End Function

Private Function AddLabel(ByVal parent As Object, ByVal nm As String, ByVal cap As String, _
        ByVal L As Single, ByVal T As Single, ByVal W As Single, ByVal H As Single) As MSForms.label
    Dim c As MSForms.label
    Set c = parent.Controls.Add("Forms.Label.1", nm, True)
    c.Left = L: c.top = T: c.width = W: c.Height = H
    c.caption = cap
    c.BackStyle = fmBackStyleTransparent
    c.font.name = "Segoe UI"
    c.font.Size = 9
    Set AddLabel = c
End Function

Private Function AddButton(ByVal nm As String, ByVal cap As String, ByVal L As Single, _
        ByVal T As Single, ByVal W As Single, ByVal H As Single, _
        ByVal primary As Boolean) As MSForms.CommandButton
    Dim c As MSForms.CommandButton
    Set c = Me.Controls.Add("Forms.CommandButton.1", nm, True)
    c.Left = L: c.top = T: c.width = W: c.Height = H
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

'=============================== public interface ==============================
' Loads the five dropdowns with displays(0..n-1) ("(none)" first) and prefills
' them with the pre Collection of display strings (the page's V1..V3 picks).
Public Sub InitPicks(ByRef displays() As String, ByVal n As Long, ByVal pre As Collection)
    mCancelled = True
    Dim i As Long, j As Long
    For i = 1 To MAX_CARS
        mCbo(i).Clear
        mCbo(i).AddItem "(none)"
        For j = 0 To n - 1
            mCbo(i).AddItem displays(j)
        Next j
        mCbo(i).ListIndex = 0
    Next i
    If Not pre Is Nothing Then
        For i = 1 To pre.Count
            If i > MAX_CARS Then Exit For
            On Error Resume Next
            mCbo(i).value = CStr(pre(i))
            On Error GoTo 0
        Next i
    End If
    lblStatus.caption = "Ready."
End Sub

Public Property Get Cancelled() As Boolean
    Cancelled = mCancelled
End Property

' The distinct, ordered picks (Baseline first). Empty / "(none)" / partial
' unresolvable text is skipped.
Public Function SelectedDisplays() As Collection
    Dim res As New Collection
    Dim seen As Object: Set seen = CreateObject("Scripting.Dictionary")
    seen.CompareMode = vbTextCompare
    Dim i As Long, T As String
    For i = 1 To MAX_CARS
        T = Trim$(mCbo(i).value & "")
        If Len(T) > 0 And StrComp(T, "(none)", vbTextCompare) <> 0 Then
            If ComboHasItem(mCbo(i), T) And Not seen.Exists(T) Then
                seen.Add T, True
                res.Add T
            End If
        End If
    Next i
    Set SelectedDisplays = res
End Function

Private Function ComboHasItem(ByVal cbo As MSForms.ComboBox, ByVal T As String) As Boolean
    Dim i As Long
    For i = 0 To cbo.ListCount - 1
        If StrComp(CStr(cbo.List(i)), T, vbTextCompare) = 0 Then
            ComboHasItem = True
            Exit Function
        End If
    Next i
End Function

'================================ EVENTS =======================================
Private Sub btnOk_Click()
    Dim picks As Collection
    Set picks = SelectedDisplays()
    If picks.Count < 2 Then
        lblStatus.caption = "Pick at least two different costbooks (Baseline + one more)."
        Exit Sub
    End If
    mCancelled = False
    Me.Hide
End Sub

Private Sub btnCancel_Click()
    mCancelled = True
    Me.Hide
End Sub

