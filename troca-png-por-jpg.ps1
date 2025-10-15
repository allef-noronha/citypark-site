# MAPEIA PNG -> JPG APENAS SE O .JPG EXISTIR
$pngs = Get-ChildItem -Recurse -File -Include *.png
$map  = @{}
foreach ($p in $pngs) {
  $jpg = [IO.Path]::ChangeExtension($p.FullName, ".jpg")
  if (Test-Path $jpg) {
    $map[$p.Name] = [IO.Path]::GetFileName($jpg)  # ex.: "Imagem.png" -> "Imagem.jpg"
  }
}

# DETECTA BOM E DEVOLVE A ENCODING
function Get-EncodingFromBom {
  param([byte[]]$Bytes)
  if ($Bytes.Length -ge 3 -and $Bytes[0] -eq 0xEF -and $Bytes[1] -eq 0xBB -and $Bytes[2] -eq 0xBF) {
    return @{ Enc = [Text.UTF8Encoding]::new($true);  BomLen = 3 }   # UTF-8 BOM
  }
  if ($Bytes.Length -ge 2 -and $Bytes[0] -eq 0xFF -and $Bytes[1] -eq 0xFE) {
    return @{ Enc = [Text.UnicodeEncoding]::new($false,$true); BomLen = 2 }  # UTF-16 LE
  }
  if ($Bytes.Length -ge 2 -and $Bytes[0] -eq 0xFE -and $Bytes[1] -eq 0xFF) {
    return @{ Enc = [Text.UnicodeEncoding]::new($true,$true);  BomLen = 2 }  # UTF-16 BE
  }
  return @{ Enc = [Text.UTF8Encoding]::new($false); BomLen = 0 }     # UTF-8 sem BOM (padrão)
}

# SUBSTITUI PRESERVANDO A MESMA CODIFICAÇÃO/BOM
function Replace-PreserveEncoding {
  param([string]$Path, [hashtable]$Map)
  $bytes = [IO.File]::ReadAllBytes($Path)
  $info  = Get-EncodingFromBom -Bytes $bytes
  $enc   = $info.Enc
  $bom   = $info.BomLen

  $text = $enc.GetString($bytes, $bom, $bytes.Length - $bom)

  $changed = $false
  foreach ($k in $Map.Keys) {
    if ($text.Contains($k)) {
      $text = $text.Replace($k, $Map[$k])
      $changed = $true
    }
  }
  if ($changed) {
    $body = $enc.GetBytes($text)
    if ($bom -gt 0) {
      $out = New-Object byte[] ($bom + $body.Length)
      [Array]::Copy($bytes, 0, $out, 0, $bom)        # mantém o BOM original
      [Array]::Copy($body, 0, $out, $bom, $body.Length)
    } else {
      $out = $body
    }
    [IO.File]::WriteAllBytes($Path, $out)
    return $true
  }
  return $false
}

# PRÉVIA (DRY-RUN) – mostra algumas ocorrências encontradas
$code = Get-ChildItem -Recurse -File -Include *.html,*.css,*.js
$preview = @()
foreach ($f in $code) {
  $raw = [IO.File]::ReadAllBytes($f.FullName)
  $info = Get-EncodingFromBom -Bytes $raw
  $txt  = $info.Enc.GetString($raw, $info.BomLen, $raw.Length - $info.BomLen)
  foreach ($k in $map.Keys) {
    if ($txt.Contains($k)) {
      $preview += [PSCustomObject]@{ File=$f.FullName; De=$k; Para=$map[$k] }
    }
  }
}
"---- PRÉVIA (primeiros 30) ----"
$preview | Select-Object -First 30 | Format-Table -Auto
"`nTotal de ocorrências: $($preview.Count)"

# APLICA AS TROCAS (REMOVA AS DUAS LINHAS ABAIXO SE QUISER SÓ A PRÉVIA)
$mod = 0
foreach ($f in $code) { if (Replace-PreserveEncoding -Path $f.FullName -Map $map) { $mod++ } }
"Arquivos modificados: $mod"
