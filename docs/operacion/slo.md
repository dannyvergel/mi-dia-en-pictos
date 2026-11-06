# Objetivo de disponibilidad del piloto (SLO)

Es una propuesta para el piloto. No es un contrato con las escuelas ni una garantía: es la vara con la que vamos a medir si Puente anda lo suficientemente bien, y qué hacemos cuando no.

## La propuesta

**El 99% de los chequeos de salud de cada mes, en horario escolar, dan bien.**

- **Horario escolar:** lunes a viernes, de 7 a 18, hora de Argentina (10 a 21 UTC). Los feriados cuentan como días hábiles para no complicar la cuenta.
- **Chequeo bien:** `https://puentepictos.app/api/config?accion=salud` responde 200 con `"ok":true` (la función anda y la base responde un `SELECT 1` en menos de 3 segundos) **y** la portada responde 200.
- **Por qué 99% y no más:** Puente corre en planes gratuitos (Vercel Hobby, Neon Free) que no prometen disponibilidad, y lo mantiene una sola persona. 99% es exigente pero realista. Si el piloto crece, se revisa.
- **Por qué solo en horario escolar:** es cuando las seños cargan el día. Una caída a las 3 de la mañana igual llega por mail y se arregla, pero no gasta presupuesto.

## Cómo se mide

`.github/workflows/salud.yml` corre cada 15 minutos. Cada corrida es una muestra: verde (bien) o roja (mal).

- En horario escolar hay 44 muestras por día hábil y casi 970 por mes.
- Cada corrida reintenta dos veces antes de fallar (con 15 segundos de espera), así un pico aislado no cuenta como caída.
- GitHub no garantiza la hora exacta del cron: con carga, una corrida puede atrasarse o no correr. Las que no corrieron no cuentan ni a favor ni en contra.
- Si GitHub Actions mismo está caído (https://www.githubstatus.com), las corridas rojas de ese rato no se cuentan.

### Calcular el mes en PowerShell 5.1

Lee las corridas públicas del workflow (no necesita token; GitHub permite 60 pedidos por hora sin token y esto usa uno por día del mes):

```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$repo = "dannyvergel/mi-dia-en-pictos"
$inicio = Get-Date "2026-11-01"
$bien = 0
$mal = 0
for ($d = $inicio; $d.Month -eq $inicio.Month; $d = $d.AddDays(1)) {
  $dia = $d.ToString("yyyy-MM-dd")
  $url = "https://api.github.com/repos/$repo/actions/workflows/salud.yml/runs?event=schedule&per_page=100&created=$dia"
  $r = Invoke-RestMethod -Uri $url -Headers @{ "User-Agent" = "puente-slo" }
  foreach ($c in $r.workflow_runs) {
    $art = ([datetime]$c.created_at).ToUniversalTime().AddHours(-3)
    $habil = ($art.DayOfWeek -ne "Saturday") -and ($art.DayOfWeek -ne "Sunday")
    if ($habil -and $art.Hour -ge 7 -and $art.Hour -lt 18) {
      if ($c.conclusion -eq "success") { $bien++ }
      elseif ($c.conclusion -eq "failure") { $mal++ }
    }
  }
}
$total = $bien + $mal
"Muestras: $total  Bien: $bien  Mal: $mal"
if ($total -gt 0) { "Disponibilidad: {0:P2}" -f ($bien / $total) }
```

Cambiá la fecha de `$inicio` por el primer día del mes que querés medir.

## Presupuesto de error

El 1% que nos podemos permitir fallar:

- unas **9 o 10 muestras rojas por mes** en horario escolar, o
- unas **2 horas y 25 minutos** de caída por mes en horario escolar (22 días hábiles por 11 horas, el 1%).

Una caída de una tarde entera (4 horas) ya lo pasa.

## Qué hacer si se pasa (o va camino a pasarse)

Si en la mitad del mes ya se gastó más de la mitad del presupuesto, o si el mes cerró por debajo de 99%:

1. **Se congelan los cambios que no son arreglos.** Nada nuevo a `main` hasta entender qué pasó, salvo el arreglo.
2. **Se busca la causa** con los logs (ver [observabilidad.md](observabilidad.md)) y se anota: qué falló, cuánto duró, cómo se notó, qué se hizo.
3. **Se arregla la causa, no solo el síntoma.** Si fue un deploy, sumar un test que lo hubiera atrapado. Si fue un límite de un plan gratis (cómputo de Neon, funciones de Vercel), decidir si se cambia el plan o el diseño.
4. **Se avisa a las escuelas** si la caída las afectó, en una línea y sin vueltas: qué pasó, cuánto duró y qué se perdió (si se perdió algo).

Si el mes cierra muy por encima (por ejemplo 99,9%), no hace falta hacer nada: es margen para cambios más grandes.

## Lo que hay que mantener

- **Las notificaciones de GitHub.** El mail de una corrida programada que falla le llega a quien creó el workflow o a quien cambió el cron por última vez (si otra persona lo desactiva y lo vuelve a activar, le llega a esa persona). Tiene que estar activado en GitHub → **Settings** → **Notifications** → **Actions** (marcar email y «Only notify for failed workflows»).
- **Los 60 días.** En un repo público, GitHub desactiva solo los workflows programados después de **60 días sin actividad en el repo** (sin commits). Si el repo queda quieto (por ejemplo en vacaciones), entrá a GitHub → **Actions** → **salud** → **Enable workflow**, o hacé cualquier commit antes de que se cumplan. Un monitoreo apagado no avisa que está apagado.
- **El costo en la base.** Cada chequeo despierta la base de Neon, que se duerme a los 5 minutos sin uso. Con un chequeo cada 15 minutos todo el día, fuera de horario escolar la base pasa un tercio del tiempo despierta solo por el monitoreo: del orden de 160 horas por mes. Con la compute mínima de 0,25 CU son unas **40 CU-hora de las 100 que da gratis el plan Free** por mes. Si el consumo de Neon se acerca al límite (Neon → **Billing** o **Usage**), la opción es chequear solo en horario escolar, cambiando el cron por:

```yaml
    - cron: "*/15 10-20 * * 1-5"
```

  Eso mide igual el SLO (que es solo en horario escolar) y deja de gastar cómputo de noche y los fines de semana. A cambio, una caída de noche se descubre a la mañana. Con el plan Free, si se terminan las horas de cómputo, Neon suspende la base hasta el mes siguiente: eso sería una caída total.
