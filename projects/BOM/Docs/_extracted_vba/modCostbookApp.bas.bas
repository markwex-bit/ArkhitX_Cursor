Attribute VB_Name = "modCostbookApp"
'==================================================================================
' modCostbookApp  -  Entry point + desktop work-area helper for the CostBooks
' Synthesis Generator form. Assign ShowCostbooksSynthesis to a worksheet button.
'==================================================================================
Option Explicit

Private Const SPI_GETWORKAREA As Long = 48
Private Const LOGPIXELSX As Long = 88
Private Const LOGPIXELSY As Long = 90

Private Type RECT
    Left As Long
    top As Long
    Right As Long
    Bottom As Long
End Type

' NB: keep each Declare on ONE physical line - a line-continuation (_) in the
' declarations section makes the refresher's AddFromString inject a phantom "()"
' procedure at the bottom of the module on compile.
Private Declare PtrSafe Function SystemParametersInfoA Lib "user32" (ByVal uiAction As Long, ByVal uiParam As Long, ByRef pvParam As Any, ByVal fWinIni As Long) As Long
Private Declare PtrSafe Function GetDC Lib "user32" (ByVal hwnd As LongPtr) As LongPtr
Private Declare PtrSafe Function ReleaseDC Lib "user32" (ByVal hwnd As LongPtr, ByVal hdc As LongPtr) As Long
Private Declare PtrSafe Function GetDeviceCaps Lib "gdi32" (ByVal hdc As LongPtr, ByVal nIndex As Long) As Long

' Opens the 2-page CostBooks form (built entirely in code - see frmCostbooks).
' Shown MODELESS so the user can browse a generated report's sheets (and the rest
' of Excel) without closing the form first.
Public Sub ShowCostbooksSynthesis()
    frmCostbooks.Show vbModeless
End Sub

' Desktop work area (screen minus taskbar) in POINTS, for full-screen forms.
' Returns 0-sized on failure; the caller falls back to a fixed size.
Public Sub GetWorkAreaPt(ByRef L As Single, ByRef T As Single, ByRef W As Single, ByRef H As Single)
    L = 0: T = 0: W = 0: H = 0
    On Error Resume Next
    Dim rc As RECT
    If SystemParametersInfoA(SPI_GETWORKAREA, 0, rc, 0) = 0 Then Exit Sub

    Dim hdc As LongPtr, dpiX As Double, dpiY As Double
    hdc = GetDC(0)
    dpiX = GetDeviceCaps(hdc, LOGPIXELSX)
    dpiY = GetDeviceCaps(hdc, LOGPIXELSY)
    ReleaseDC 0, hdc
    If dpiX <= 0 Then dpiX = 96
    If dpiY <= 0 Then dpiY = 96

    L = rc.Left * 72# / dpiX
    T = rc.top * 72# / dpiY
    W = (rc.Right - rc.Left) * 72# / dpiX
    H = (rc.Bottom - rc.top) * 72# / dpiY
End Sub


