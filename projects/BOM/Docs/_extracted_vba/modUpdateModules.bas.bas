Attribute VB_Name = "modUpdateModules"
'==================================================================================
' modUpdateModules  -  One-click refresh of the VBA project from the src\ folder.
'
'   RefreshModulesFromFolder:
'     - .bas / .cls found in SRC_FOLDER (recursively):
'         * component EXISTS  -> its code is REPLACED IN PLACE (no Remove/Import,
'           so no "modX1" duplicate quirk and no dangling references)
'         * component MISSING -> imported normally (keeps class attributes)
'         * EXCEPTION - a module with API Declare statements (modGdiPlus,
'           modMouseWheel, modCostbookApp, modPastePicture) is IMPORTED when missing
'           but LEFT UNTOUCHED when it already exists: rewriting module-level Declares
'           in place corrupts the P-code ("Out of memory", red Declares). These
'           library modules rarely change - if one does, remove it in the VBE and
'           re-import its .bas by hand (once).
'     - every frm*.txt found in SRC_FOLDER (frmCostbooks.txt, frmGapExport.txt,
'       ...) -> pasted into the same-named UserForm's code module (the form is
'       CREATED empty first if it doesn't exist - the layouts are code-built,
'       so an empty designer is all a form needs)
'     - this module itself is skipped (running code can't rewrite itself)
'
' REQUIREMENT: File > Options > Trust Center > Trust Center Settings >
'              Macro Settings > "Trust access to the VBA project object model".
'
' No VBIDE reference needed (late-bound). Import this one module by hand once;
' it maintains everything else afterwards.
'==================================================================================
Option Explicit

' >>> Folder holding the source files (trailing backslash optional)
Private Const SRC_FOLDER As String = _
    "P:\SE16614\VM Archive\CLAUDE\TPC Database\CostBooks Synthesis Generator\src\"

Private Const SELF_NAME As String = "modUpdateModules"
Private Const FORM_FILE_PATTERN As String = "frm*.txt"   ' code-built forms in SRC_FOLDER

' VBIDE component types (late-bound constants)
Private Const ctStdModule As Long = 1
Private Const ctClassModule As Long = 2
Private Const ctMSForm As Long = 3

Public Sub RefreshModulesFromFolder()
    Dim vbProj As Object
    On Error Resume Next
    Set vbProj = ThisWorkbook.VBProject
    If vbProj Is Nothing Or Err.Number <> 0 Then
        MsgBox "Cannot access the VBA project." & vbCrLf & vbCrLf & _
               "Enable: File > Options > Trust Center > Trust Center Settings > " & _
               "Macro Settings > 'Trust access to the VBA project object model'.", _
               vbExclamation, "Refresh modules"
        Exit Sub
    End If
    On Error GoTo 0

    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    If Not fso.FolderExists(SRC_FOLDER) Then
        MsgBox "Source folder not found:" & vbCrLf & SRC_FOLDER, vbExclamation, "Refresh modules"
        Exit Sub
    End If

    Dim added As Long, updated As Long, skipped As Long, dups As Long, formMsg As String
    dups = RemoveNumberedDuplicates(vbProj, fso)
    ProcessFolder vbProj, fso, fso.GetFolder(SRC_FOLDER), added, updated, skipped
    formMsg = UpdateAllForms(vbProj, fso)

    MsgBox "Modules refreshed from:" & vbCrLf & SRC_FOLDER & vbCrLf & vbCrLf & _
           "Updated in place: " & updated & vbCrLf & _
           "Imported (new):   " & added & vbCrLf & _
           IIf(dups > 0, "Duplicates removed (name1/name2): " & dups & vbCrLf, "") & _
           IIf(skipped > 0, "Skipped:          " & skipped & vbCrLf, "") & _
           formMsg & vbCrLf & vbCrLf & _
           "Now run Debug > Compile VBAProject, then SAVE the workbook.", _
           vbInformation, "Refresh modules"
End Sub

' Removes stale artifacts of earlier failed imports: components named like a
' source file plus a numeric suffix (clsCatModel1, modCostbookData2, ...), which
' Excel creates when importing while a same-named component already exists.
Private Function RemoveNumberedDuplicates(ByVal vbProj As Object, ByVal fso As Object) As Long
    Dim bases As Object: Set bases = CreateObject("Scripting.Dictionary")
    bases.CompareMode = vbTextCompare
    CollectBaseNames fso, fso.GetFolder(SRC_FOLDER), bases

    Dim i As Long, comp As Object, nm As String, root As String
    For i = vbProj.VBComponents.Count To 1 Step -1
        Set comp = vbProj.VBComponents(i)
        If comp.Type = ctStdModule Or comp.Type = ctClassModule Then
            nm = comp.name
            root = nm
            Do While Len(root) > 0 And IsNumeric(Right$(root, 1))
                root = Left$(root, Len(root) - 1)
            Loop
            If Len(root) < Len(nm) And bases.Exists(root) Then
                vbProj.VBComponents.Remove comp
                RemoveNumberedDuplicates = RemoveNumberedDuplicates + 1
            End If
        End If
    Next i
End Function

Private Sub CollectBaseNames(ByVal fso As Object, ByVal folder As Object, ByVal bases As Object)
    Dim file As Object, subFolder As Object, ext As String
    For Each file In folder.Files
        ext = LCase$(fso.GetExtensionName(file.name))
        If ext = "bas" Or ext = "cls" Then _
            bases(fso.GetBaseName(file.name)) = True
    Next file
    For Each subFolder In folder.SubFolders
        CollectBaseNames fso, subFolder, bases
    Next subFolder
End Sub

'------------------------- recursive .bas / .cls sync ---------------------------
Private Sub ProcessFolder(ByVal vbProj As Object, ByVal fso As Object, ByVal folder As Object, _
        ByRef added As Long, ByRef updated As Long, ByRef skipped As Long)
    Dim file As Object, subFolder As Object
    Dim ext As String, compName As String, comp As Object

    Dim wantType As Long
    For Each file In folder.Files
        ext = LCase$(fso.GetExtensionName(file.name))
        If ext = "bas" Or ext = "cls" Then
            compName = fso.GetBaseName(file.name)
            If StrComp(compName, SELF_NAME, vbTextCompare) = 0 Then
                skipped = skipped + 1              ' never rewrite the running module
            Else
                wantType = IIf(ext = "cls", ctClassModule, ctStdModule)
                Dim srcText As String
                srcText = fso.OpenTextFile(file.path, 1).ReadAll
                Set comp = FindComponent(vbProj, compName)
                If (Not comp Is Nothing) And HasDeclare(srcText) Then
                    ' API-Declare module that already exists: leave it ALONE. Rewriting
                    ' module-level Declare statements in place (DeleteLines +
                    ' AddFromString) corrupts the P-code and throws "Out of memory"
                    ' (the Declares turn red). These are stable library modules - if one
                    ' ever changes, remove it in the VBE and re-import its .bas by hand.
                    skipped = skipped + 1
                Else
                    ' Wrong type (e.g. a class that once imported as a std module):
                    ' updating in place would keep the wrong type - replace it fully.
                    If Not comp Is Nothing Then
                        If comp.Type <> wantType Then
                            vbProj.VBComponents.Remove comp
                            Set comp = Nothing
                        End If
                    End If
                    If comp Is Nothing Then
                        vbProj.VBComponents.Import file.path     ' new module (incl. first import of a Declare module)
                        added = added + 1
                    Else
                        ReplaceCode comp, StripHeader(srcText)
                        updated = updated + 1
                    End If
                End If
            End If
        End If
    Next file

    For Each subFolder In folder.SubFolders
        ProcessFolder vbProj, fso, subFolder, added, updated, skipped
    Next subFolder
End Sub

'------------------------------ form code update --------------------------------
' The forms are code-built, so each frm*.txt is pure code: create the (empty)
' form when missing, then replace its code module wholesale. One status line
' per form file found in SRC_FOLDER.
Private Function UpdateAllForms(ByVal vbProj As Object, ByVal fso As Object) As String
    Dim file As Object, msg As String, found As Boolean
    For Each file In fso.GetFolder(SRC_FOLDER).Files
        If LCase$(file.name) Like LCase$(FORM_FILE_PATTERN) Then
            found = True
            msg = msg & UpdateOneForm(vbProj, fso, file) & vbCrLf
        End If
    Next file
    If Not found Then msg = "Form: no " & FORM_FILE_PATTERN & " files found - forms untouched." & vbCrLf
    UpdateAllForms = Left$(msg, Len(msg) - 2)        ' drop the trailing CrLf
End Function

Private Function UpdateOneForm(ByVal vbProj As Object, ByVal fso As Object, _
                               ByVal file As Object) As String
    Dim formName As String
    formName = fso.GetBaseName(file.name)

    Dim comp As Object
    Set comp = FindComponent(vbProj, formName)
    If comp Is Nothing Then
        Set comp = vbProj.VBComponents.Add(ctMSForm)
        comp.name = formName
        UpdateOneForm = "Form: " & formName & " created + code injected."
    ElseIf comp.Type <> ctMSForm Then
        UpdateOneForm = "Form: a non-form component named " & formName & _
                        " already exists - form untouched."
        Exit Function
    Else
        UpdateOneForm = "Form: " & formName & " code updated."
    End If
    ReplaceCode comp, fso.OpenTextFile(file.path, 1).ReadAll
End Function

'--------------------------------- helpers --------------------------------------
' True when the source has a module-level API Declare statement. Such modules are
' left untouched when already present (in-place rewrite corrupts them - ProcessFolder).
Private Function HasDeclare(ByVal code As String) As Boolean
    Dim lines() As String, i As Long, s As String
    lines = Split(Replace(code, vbCrLf, vbLf), vbLf)
    For i = LBound(lines) To UBound(lines)
        s = LCase$(Trim$(lines(i)))
        If s Like "declare *" Or s Like "public declare *" Or s Like "private declare *" Then
            HasDeclare = True
            Exit Function
        End If
    Next i
End Function

Private Function FindComponent(ByVal vbProj As Object, ByVal compName As String) As Object
    Dim comp As Object
    For Each comp In vbProj.VBComponents
        If StrComp(comp.name, compName, vbTextCompare) = 0 Then
            If comp.Type = ctStdModule Or comp.Type = ctClassModule Or comp.Type = ctMSForm Then
                Set FindComponent = comp
                Exit Function
            End If
        End If
    Next comp
End Function

Private Sub ReplaceCode(ByVal comp As Object, ByVal code As String)
    ' Trailing blank lines fed to AddFromString make the VBE append a phantom empty
    ' "()" procedure at the bottom of the module (a compile error). Strip trailing
    ' whitespace/newlines first, then belt-and-suspenders delete any "()" line the
    ' VBE still injects.
    Do While Len(code) > 0
        Dim cH As String: cH = Right$(code, 1)
        If cH = vbCr Or cH = vbLf Or cH = " " Or cH = vbTab Then
            code = Left$(code, Len(code) - 1)
        Else
            Exit Do
        End If
    Loop
    With comp.CodeModule
        If .CountOfLines > 0 Then .DeleteLines 1, .CountOfLines
        .AddFromString code
        Dim i As Long
        For i = .CountOfLines To 1 Step -1
            If Trim$(.lines(i, 1)) = "()" Then .DeleteLines i, 1
        Next i
    End With
End Sub

' Drops the export header of a .bas/.cls file (VERSION/BEGIN/END block and the
' leading Attribute lines) - CodeModule.AddFromString must receive code only.
Private Function StripHeader(ByVal text As String) As String
    Dim lines() As String, i As Long, firstBody As Long, s As String
    text = Replace(text, vbCrLf, vbLf)
    lines = Split(text, vbLf)
    firstBody = UBound(lines) + 1
    For i = LBound(lines) To UBound(lines)
        s = Trim$(lines(i))
        If Not (s Like "VERSION *" Or s = "BEGIN" Or s Like "MultiUse *" Or _
                s = "END" Or s Like "Attribute VB_*") Then
            firstBody = i
            Exit For
        End If
    Next i
    Dim out As String
    For i = firstBody To UBound(lines)
        out = out & lines(i) & vbCrLf
    Next i
    StripHeader = out
End Function


