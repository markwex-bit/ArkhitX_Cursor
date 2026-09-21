Attribute VB_Name = "modGdiPlus"
'==================================================================================
' modGdiPlus  -  Thin wrapper over the Windows GDI+ "flat" C API (gdiplus.dll).
'
' gdiplus.dll ships with every supported version of Windows, so NOTHING needs to
' be installed and NO VBA reference has to be ticked.  This module only exposes
' the handful of GDI+ entry points the gauge needs, plus start/stop helpers and
' a PNG saver.
'
' Requires VBA7 (Office 2010+).  For legacy 32-bit Office 2007 remove every
' "PtrSafe" keyword and change each "LongPtr" to "Long".
'==================================================================================
Option Explicit

Public Const PixelFormat32bppARGB As Long = &H26200A

' --- enum values we use -----------------------------------------------------
Public Const SmoothingModeAntiAlias As Long = 4
Public Const PixelOffsetModeHighQuality As Long = 2
Public Const TextRenderingHintAntiAlias As Long = 4
Public Const UnitPixel As Long = 2
Public Const FontStyleRegular As Long = 0
Public Const FontStyleBold As Long = 1
Public Const StringAlignCenter As Long = 1
Public Const LineCapRound As Long = 2
Public Const MatrixOrderPrepend As Long = 0

Public Type GdipGUID
    Data1 As Long
    Data2 As Integer
    Data3 As Integer
    Data4(0 To 7) As Byte
End Type

Public Type GdipRectF
    Left As Single
    top As Single
    width As Single
    Height As Single
End Type

Private Type GdiStartupInput
    GdiplusVersion As Long
    DebugEventCallback As LongPtr
    SuppressBackgroundThread As Long
    SuppressExternalCodecs As Long
End Type

' --- lifecycle --------------------------------------------------------------
Private Declare PtrSafe Function GdiplusStartup Lib "gdiplus" (ByRef token As LongPtr, ByRef inputbuf As GdiStartupInput, ByVal outputbuf As LongPtr) As Long
Private Declare PtrSafe Sub GdiplusShutdown Lib "gdiplus" (ByVal token As LongPtr)

' --- image / graphics -------------------------------------------------------
Public Declare PtrSafe Function GdipCreateBitmapFromScan0 Lib "gdiplus" (ByVal W As Long, ByVal H As Long, ByVal stride As Long, ByVal pf As Long, ByVal scan0 As LongPtr, ByRef bitmap As LongPtr) As Long
Public Declare PtrSafe Function GdipGetImageGraphicsContext Lib "gdiplus" (ByVal image As LongPtr, ByRef graphics As LongPtr) As Long
Public Declare PtrSafe Function GdipDeleteGraphics Lib "gdiplus" (ByVal graphics As LongPtr) As Long
Public Declare PtrSafe Function GdipDisposeImage Lib "gdiplus" (ByVal image As LongPtr) As Long
Public Declare PtrSafe Function GdipSetSmoothingMode Lib "gdiplus" (ByVal graphics As LongPtr, ByVal mode As Long) As Long
Public Declare PtrSafe Function GdipSetTextRenderingHint Lib "gdiplus" (ByVal graphics As LongPtr, ByVal mode As Long) As Long
Public Declare PtrSafe Function GdipSetPixelOffsetMode Lib "gdiplus" (ByVal graphics As LongPtr, ByVal mode As Long) As Long

' --- world transform (used for rotated text) --------------------------------
Public Declare PtrSafe Function GdipResetWorldTransform Lib "gdiplus" (ByVal graphics As LongPtr) As Long
Public Declare PtrSafe Function GdipTranslateWorldTransform Lib "gdiplus" (ByVal graphics As LongPtr, ByVal dx As Single, ByVal dy As Single, ByVal order As Long) As Long
Public Declare PtrSafe Function GdipRotateWorldTransform Lib "gdiplus" (ByVal graphics As LongPtr, ByVal angle As Single, ByVal order As Long) As Long

' --- brushes / pens ---------------------------------------------------------
Public Declare PtrSafe Function GdipCreateSolidFill Lib "gdiplus" (ByVal color As Long, ByRef brush As LongPtr) As Long
Public Declare PtrSafe Function GdipDeleteBrush Lib "gdiplus" (ByVal brush As LongPtr) As Long
Public Declare PtrSafe Function GdipCreatePen1 Lib "gdiplus" (ByVal color As Long, ByVal width As Single, ByVal unit As Long, ByRef pen As LongPtr) As Long
Public Declare PtrSafe Function GdipDeletePen Lib "gdiplus" (ByVal pen As LongPtr) As Long
Public Declare PtrSafe Function GdipSetPenLineCap197819 Lib "gdiplus" (ByVal pen As LongPtr, ByVal startCap As Long, ByVal endCap As Long, ByVal dashCap As Long) As Long

' --- paths ------------------------------------------------------------------
Public Declare PtrSafe Function GdipCreatePath Lib "gdiplus" (ByVal brushMode As Long, ByRef path As LongPtr) As Long
Public Declare PtrSafe Function GdipDeletePath Lib "gdiplus" (ByVal path As LongPtr) As Long
Public Declare PtrSafe Function GdipAddPathArc Lib "gdiplus" (ByVal path As LongPtr, ByVal x As Single, ByVal y As Single, ByVal W As Single, ByVal H As Single, ByVal startAngle As Single, ByVal sweepAngle As Single) As Long
Public Declare PtrSafe Function GdipAddPathLine Lib "gdiplus" (ByVal path As LongPtr, ByVal x1 As Single, ByVal y1 As Single, ByVal x2 As Single, ByVal y2 As Single) As Long
Public Declare PtrSafe Function GdipClosePathFigure Lib "gdiplus" (ByVal path As LongPtr) As Long
Public Declare PtrSafe Function GdipFillPath Lib "gdiplus" (ByVal graphics As LongPtr, ByVal brush As LongPtr, ByVal path As LongPtr) As Long
Public Declare PtrSafe Function GdipDrawPath Lib "gdiplus" (ByVal graphics As LongPtr, ByVal pen As LongPtr, ByVal path As LongPtr) As Long

' --- primitives -------------------------------------------------------------
Public Declare PtrSafe Function GdipDrawLine Lib "gdiplus" (ByVal graphics As LongPtr, ByVal pen As LongPtr, ByVal x1 As Single, ByVal y1 As Single, ByVal x2 As Single, ByVal y2 As Single) As Long
Public Declare PtrSafe Function GdipFillEllipse Lib "gdiplus" (ByVal graphics As LongPtr, ByVal brush As LongPtr, ByVal x As Single, ByVal y As Single, ByVal W As Single, ByVal H As Single) As Long

' --- text -------------------------------------------------------------------
Public Declare PtrSafe Function GdipCreateFontFamilyFromName Lib "gdiplus" (ByVal name As LongPtr, ByVal fontCollection As LongPtr, ByRef family As LongPtr) As Long
Public Declare PtrSafe Function GdipDeleteFontFamily Lib "gdiplus" (ByVal family As LongPtr) As Long
Public Declare PtrSafe Function GdipCreateFont Lib "gdiplus" (ByVal family As LongPtr, ByVal emSize As Single, ByVal style As Long, ByVal unit As Long, ByRef font As LongPtr) As Long
Public Declare PtrSafe Function GdipDeleteFont Lib "gdiplus" (ByVal font As LongPtr) As Long
Public Declare PtrSafe Function GdipCreateStringFormat Lib "gdiplus" (ByVal formatAttributes As Long, ByVal language As Long, ByRef format As LongPtr) As Long
Public Declare PtrSafe Function GdipDeleteStringFormat Lib "gdiplus" (ByVal format As LongPtr) As Long
Public Declare PtrSafe Function GdipSetStringFormatAlign Lib "gdiplus" (ByVal format As LongPtr, ByVal align As Long) As Long
Public Declare PtrSafe Function GdipSetStringFormatLineAlign Lib "gdiplus" (ByVal format As LongPtr, ByVal align As Long) As Long
Public Declare PtrSafe Function GdipDrawString Lib "gdiplus" (ByVal graphics As LongPtr, ByVal str As LongPtr, ByVal Length As Long, ByVal font As LongPtr, ByRef layoutRect As GdipRectF, ByVal stringFormat As LongPtr, ByVal brush As LongPtr) As Long
Public Declare PtrSafe Function GdipMeasureString Lib "gdiplus" (ByVal graphics As LongPtr, ByVal str As LongPtr, ByVal Length As Long, ByVal font As LongPtr, ByRef layoutRect As GdipRectF, ByVal stringFormat As LongPtr, ByRef boundingBox As GdipRectF, ByRef codepointsFitted As Long, ByRef linesFilled As Long) As Long

' --- encoding ---------------------------------------------------------------
Public Declare PtrSafe Function GdipSaveImageToFile Lib "gdiplus" (ByVal image As LongPtr, ByVal filename As LongPtr, ByRef clsidEncoder As GdipGUID, ByVal encoderParams As LongPtr) As Long
Private Declare PtrSafe Function CLSIDFromString Lib "ole32" (ByVal lpsz As LongPtr, ByRef pclsid As GdipGUID) As Long

' --- bitmap handle + clipboard (for pasting straight into Excel) -------------
Public Const CF_BITMAP As Long = 2
Public Declare PtrSafe Function GdipCreateHBITMAPFromBitmap Lib "gdiplus" (ByVal bitmap As LongPtr, ByRef hbmReturn As LongPtr, ByVal background As Long) As Long
Public Declare PtrSafe Function OpenClipboard Lib "user32" (ByVal hwnd As LongPtr) As Long
Public Declare PtrSafe Function EmptyClipboard Lib "user32" () As Long
Public Declare PtrSafe Function SetClipboardData Lib "user32" (ByVal uFormat As Long, ByVal hMem As LongPtr) As LongPtr
Public Declare PtrSafe Function CloseClipboard Lib "user32" () As Long

Private mToken As LongPtr

'-------------------------------------------------------------------------------
Public Function GdipStart() As Boolean
    If mToken <> 0 Then GdipStart = True: Exit Function
    Dim si As GdiStartupInput
    si.GdiplusVersion = 1
    GdipStart = (GdiplusStartup(mToken, si, 0) = 0)
End Function

Public Sub GdipStop()
    If mToken <> 0 Then GdiplusShutdown mToken: mToken = 0
End Sub

' Standard built-in PNG encoder CLSID.
Public Function GetPngEncoderClsid(ByRef g As GdipGUID) As Boolean
    GetPngEncoderClsid = (CLSIDFromString(StrPtr("{557CF406-1A04-11D1-9A73-0000F81EF32E}"), g) = 0)
End Function
