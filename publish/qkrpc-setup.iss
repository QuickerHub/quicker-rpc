; qkrpc Windows installer (Inno Setup 6).
; Build: pwsh ./publish/Build-QkrpcSetup.ps1

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef AppVersionFull
  #define AppVersionFull AppVersion
#endif
#ifndef SourceDir
  #define SourceDir "cli"
#endif
#ifndef OutputDir
  #define OutputDir "."
#endif

#define AppName "qkrpc"
#define AppPublisher "QuickerHub"
#define AppURL "https://github.com/QuickerHub/quicker-rpc"
#define AppExeName "qkrpc.exe"

[Setup]
AppId={{7B4E9A2C-1F3D-4B8E-9C6A-5D2E8F0A1B3C}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersionFull}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}/releases
DefaultDirName={localappdata}\Programs\{#AppName}
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir={#OutputDir}
OutputBaseFilename=qkrpc-{#AppVersion}-win-x64-setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName={#AppName}
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"

[Code]
function SplitPathSegments(const PathList: string): TArrayOfString;
var
  Rest: string;
  P: Integer;
  Part: string;
begin
  Rest := PathList;
  SetArrayLength(Result, 0);
  while Rest <> '' do
  begin
    P := Pos(';', Rest);
    if P = 0 then
    begin
      SetArrayLength(Result, GetArrayLength(Result) + 1);
      Result[GetArrayLength(Result) - 1] := Rest;
      Break;
    end;
    Part := Copy(Rest, 1, P - 1);
    if Part <> '' then
    begin
      SetArrayLength(Result, GetArrayLength(Result) + 1);
      Result[GetArrayLength(Result) - 1] := Part;
    end;
    Delete(Rest, 1, P);
  end;
end;

function NeedsAddPath(const Param: string): Boolean;
var
  OrigPath: string;
begin
  if not RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', OrigPath) then
    Result := True
  else
    Result := Pos(';' + Uppercase(Param) + ';', ';' + Uppercase(OrigPath) + ';') = 0;
end;

function IsStaleQkrpcPath(const Segment: string): Boolean;
var
  N: string;
begin
  N := Uppercase(Segment);
  Result := (Pos('\PUBLISH\CLI', N) > 0) or (Pos('/PUBLISH/CLI', N) > 0);
end;

function RemoveStaleQkrpcPaths(var PathValue: string): Boolean;
var
  Parts: TArrayOfString;
  I: Integer;
  Changed: Boolean;
begin
  Changed := False;
  if PathValue = '' then
  begin
    Result := False;
    Exit;
  end;

  Parts := SplitPathSegments(PathValue);
  PathValue := '';
  for I := 0 to GetArrayLength(Parts) - 1 do
  begin
    if Parts[I] = '' then
      Continue;
    if IsStaleQkrpcPath(Parts[I]) then
    begin
      Changed := True;
      Continue;
    end;
    if PathValue <> '' then
      PathValue := PathValue + ';';
    PathValue := PathValue + Parts[I];
  end;
  Result := Changed;
end;

procedure UpdateUserPath(const AppDir: string; const AddApp: Boolean);
var
  OrigPath: string;
  NewPath: string;
  AppUpper: string;
begin
  if not RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', OrigPath) then
    OrigPath := '';

  NewPath := OrigPath;
  RemoveStaleQkrpcPaths(NewPath);

  AppUpper := Uppercase(AppDir);
  if AddApp then
  begin
    if Pos(';' + AppUpper + ';', ';' + Uppercase(NewPath) + ';') = 0 then
    begin
      if NewPath <> '' then
        NewPath := NewPath + ';';
      NewPath := NewPath + AppDir;
    end;
  end;

  if NewPath <> OrigPath then
    RegWriteStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', NewPath);
end;

procedure RemoveAppFromUserPath(const AppDir: string);
var
  OrigPath: string;
  Parts: TArrayOfString;
  I: Integer;
  NewPath: string;
  Target: string;
begin
  Target := Uppercase(AppDir);
  if not RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', OrigPath) then
    Exit;

  Parts := SplitPathSegments(OrigPath);
  NewPath := '';
  for I := 0 to GetArrayLength(Parts) - 1 do
  begin
    if (Parts[I] = '') or (Uppercase(Parts[I]) = Target) then
      Continue;
    if NewPath <> '' then
      NewPath := NewPath + ';';
    NewPath := NewPath + Parts[I];
  end;

  if NewPath <> OrigPath then
    RegWriteStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', NewPath);
end;

function KillQkrpcProcesses(): Boolean;
var
  ResultCode: Integer;
begin
  { taskkill exit 128 = process not found; still safe to continue }
  if Exec('taskkill.exe', '/IM qkrpc.exe /T /F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    Sleep(500);
  Result := True;
end;

function InitializeSetup(): Boolean;
begin
  Result := KillQkrpcProcesses();
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    UpdateUserPath(ExpandConstant('{app}'), True);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    RemoveAppFromUserPath(ExpandConstant('{app}'));
end;
