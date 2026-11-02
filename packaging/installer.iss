#ifndef AppVersion
  #error AppVersion must be supplied by scripts/build_installer.py
#endif

[Setup]
AppId={{A37CF996-669D-4B47-8669-332D2E9DDA37}
AppName=Verity
AppVersion={#AppVersion}
AppPublisher=GoyimUser
AppPublisherURL=https://github.com/GoyimUser/verity-exam-analytics
AppSupportURL=https://github.com/GoyimUser/verity-exam-analytics/issues
AppUpdatesURL=https://github.com/GoyimUser/verity-exam-analytics/releases
DefaultDirName={localappdata}\Programs\Verity
DefaultGroupName=Verity
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\release
OutputBaseFilename=Verity-{#AppVersion}-windows-x64-setup
SetupIconFile=..\build\verity.ico
UninstallDisplayIcon={app}\Verity.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=no
RestartApplications=no
UninstallDisplayName=Verity

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: unchecked

[Files]
Source: "..\dist\Verity.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\WINDOWS.md"; DestDir: "{app}"; DestName: "README.md"; Flags: ignoreversion
Source: "..\THIRD_PARTY_NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\build\third-party\*"; DestDir: "{app}\third-party"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\static\fonts\*.txt"; DestDir: "{app}\font-licenses"; Flags: ignoreversion
Source: "..\static\fonts\README.md"; DestDir: "{app}\font-licenses"; Flags: ignoreversion
Source: "..\static\vendor\*.txt"; DestDir: "{app}\chart-licenses"; Flags: ignoreversion

[Icons]
Name: "{group}\Verity"; Filename: "{app}\Verity.exe"
Name: "{autodesktop}\Verity"; Filename: "{app}\Verity.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Verity.exe"; Description: "Launch Verity"; Flags: nowait postinstall skipifsilent

[Code]
function HasWebView2: Boolean;
var
  Version: String;
  Key: String;
begin
  Key := 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';
  Result := (RegQueryStringValue(HKLM32, Key, 'pv', Version) and
             (Version <> '') and (Version <> '0.0.0.0')) or
            (RegQueryStringValue(HKCU32, Key, 'pv', Version) and
             (Version <> '') and (Version <> '0.0.0.0')) or
            (RegQueryStringValue(HKCU64, Key, 'pv', Version) and
             (Version <> '') and (Version <> '0.0.0.0'));
end;

function InitializeSetup: Boolean;
begin
  Result := HasWebView2;
  if not Result then
    SuppressibleMsgBox('Verity requires Microsoft Edge WebView2 Runtime.' + #13#10 +
      'Install the Evergreen Runtime from https://developer.microsoft.com/microsoft-edge/webview2/ and run this installer again.',
      mbError, MB_OK, IDOK);
end;

// No database files or data-directory cleanup entries belong in this installer.
// Uninstall removes installed application files, never the user's Verity profile.
