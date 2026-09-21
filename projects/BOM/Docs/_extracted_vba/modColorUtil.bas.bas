Attribute VB_Name = "modColorUtil"
'==================================================================================
' modColorUtil  -  Pure helpers shared by every renderer + surface.
'   - Colour packing/unpacking as 0xAARRGGBB Longs (ARGB / HexToArgb / UnpackArgb)
'   - PI + a 2D point type used by wedge/arc geometry
'   - Locale-safe numeric parse (ParseNum) and round-half-up
' No drawing, no worksheet access - safe to import anywhere.
'==================================================================================
Option Explicit

Public Const PI As Double = 3.14159265358979

' A 2D point in screen coordinates (x right, y down).
Public Type GPt
    x As Single
    y As Single
End Type

'--- colour -------------------------------------------------------------------
' Pack alpha/red/green/blue (each 0..255) into a signed Long 0xAARRGGBB.
Public Function argb(ByVal a As Long, ByVal r As Long, ByVal g As Long, ByVal b As Long) As Long
    Dim v As Double
    v = a * 16777216# + r * 65536# + g * 256# + b
    If v > 2147483647# Then v = v - 4294967296#
    argb = CLng(v)
End Function

' "#2E9B47" (or "2E9B47") -> packed ARGB Long, opaque unless alpha given.
Public Function HexToArgb(ByVal hex As String, Optional ByVal alpha As Long = 255) As Long
    hex = Replace(hex, "#", "")
    HexToArgb = argb(alpha, CLng("&H" & Mid$(hex, 1, 2)), _
                            CLng("&H" & Mid$(hex, 3, 2)), _
                            CLng("&H" & Mid$(hex, 5, 2)))
End Function

' Text colour that stays legible on a given background: white on dark backgrounds,
' a dark slate on light ones (Rec.601 luma threshold). The dark slate also reads on
' white, so a wide label that slightly overhangs a light segment stays visible.
Public Function IdealTextColor(ByVal bgArgb As Long) As Long
    Dim a As Long, r As Long, g As Long, b As Long
    UnpackArgb bgArgb, a, r, g, b
    If (0.299 * r + 0.587 * g + 0.114 * b) >= 150# Then
        IdealTextColor = argb(255, 43, 52, 64)       ' #2B3440 dark slate (on light bg)
    Else
        IdealTextColor = argb(255, 255, 255, 255)    ' white (on dark bg)
    End If
End Function

' Split a packed ARGB Long back into its channels (used by the shape surface to
' set Fill.ForeColor.RGB + Fill.Transparency).
Public Sub UnpackArgb(ByVal argb As Long, ByRef a As Long, ByRef r As Long, ByRef g As Long, ByRef b As Long)
    Dim u As Double
    u = argb
    If u < 0 Then u = u + 4294967296#
    a = Int(u / 16777216#): u = u - a * 16777216#
    r = Int(u / 65536#):    u = u - r * 65536#
    g = Int(u / 256#):      u = u - g * 256#
    b = u
End Sub

'--- numeric ------------------------------------------------------------------
Public Function RoundHalfUp(ByVal x As Double, ByVal d As Long) As Double
    Dim f As Double
    f = 10# ^ d
    RoundHalfUp = Int(x * f + 0.5 + 0.000000001) / f
End Function

Public Function MinS(ByVal a As Single, ByVal b As Single) As Single
    MinS = IIf(a < b, a, b)
End Function

Public Function ToDbl(ByVal v As Variant) As Double
    If IsNumeric(v) Then ToDbl = CDbl(v) Else ToDbl = 0#
End Function

' Locale-independent parse of user-typed text: accepts BOTH "," and "." as the
' decimal separator (e.g. "2,4" or "2.4"). Returns 0 for blank/non-numeric input.
Public Function ParseNum(ByVal v As Variant) As Double
    Dim s As String
    s = Trim$(CStr(v))
    If Len(s) = 0 Then Exit Function
    s = Replace(s, ",", ".")              ' unify to a "." decimal point
    ParseNum = Val(s)                     ' Val always treats "." as the decimal sep
End Function

