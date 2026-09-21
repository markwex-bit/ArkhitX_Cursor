Attribute VB_Name = "modChartUtil"
'==================================================================================
' modChartUtil  -  Number formatting for the line chart.
'   - thousands separator = space  (" ")   e.g.  17 946
'   - decimal separator   = period (".")
'   - gap                 = percentage with one decimal, e.g.  5.3%
' Built manually so the output is independent of the machine's locale (the gauge's
' modColorUtil already owns ARGB/HexToArgb/PI, which this chart reuses).
'==================================================================================
Option Explicit

' Formats a number with a space thousands separator and a '.' decimal separator.
' decimals = 0 -> integer (e.g. 17 946); decimals = 1 -> e.g. 1 234.5
Public Function FmtSpace(ByVal v As Double, ByVal decimals As Long) As String
    Dim neg As Boolean, f As Double, n As Double, ip As String, fp As String
    neg = (v < 0)
    v = Abs(v)
    f = 10# ^ decimals
    n = Int(v * f + 0.5) / f                 ' round half up
    ip = CStr(CDbl(Int(n)))                   ' integer part as plain digits

    ' group the integer part with spaces every three digits from the right
    Dim grouped As String, c As Long, cntr As Long
    cntr = 0
    For c = Len(ip) To 1 Step -1
        grouped = Mid$(ip, c, 1) & grouped
        cntr = cntr + 1
        If (cntr Mod 3 = 0) And c > 1 Then grouped = " " & grouped
    Next c

    If decimals > 0 Then
        fp = CStr(CDbl(Int((n - Int(n)) * f + 0.5)))
        Do While Len(fp) < decimals: fp = "0" & fp: Loop
        grouped = grouped & "." & fp
    End If

    If neg Then grouped = "-" & grouped
    FmtSpace = grouped
End Function

' Gap supplied as a fraction (0.053) -> "5.3%".
Public Function FmtGap(ByVal frac As Double) As String
    FmtGap = FmtSpace(frac * 100#, 1) & "%"
End Function

' Like FmtSpace but prefixes the currency symbol, e.g. cur="â‚¬" -> "â‚¬17 946".
' A blank currency leaves the number unchanged.
Public Function FmtMoney(ByVal v As Double, ByVal decimals As Long, ByVal cur As String) As String
    FmtMoney = cur & FmtSpace(v, decimals)
End Function
