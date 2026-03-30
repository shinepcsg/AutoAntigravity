[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-cn.md) | [繁體中文](README.zh-tw.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-br.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

---

# AutoAntigravity

Una extensión de Antigravity que integra las funciones de **Aceptación Automática (Auto Accept)** y el **Bucle de Ralph (Ralph Loop)** en un solo complemento.

---

## ✨ Características Principales

### ⚡ Aceptación Automática (Auto Accept)
Acepta automáticamente **ediciones de archivos, comandos de terminal y solicitudes de permisos** sugeridos por el agente de Antigravity.

- **CDP (Chrome DevTools Protocol) + MutationObserver**: Detecta cambios en el DOM inmediatamente → Hace clic en los botones de forma automática.
- **Sondeo de VS Code Commands API**: Ejecuta automáticamente `acceptAgentStep`, `terminalCommand.run`, etc.
- **Botones detectados**: `Run`, `Accept`, `Always Allow`, `Allow`, `Retry`, `Continue`
- **Soporte para textos de botones personalizados** (Soporte multilingüe).

### 📱 Integración con Bot de Telegram
Monitoree y gestione los flujos de trabajo a través de un bot de Telegram.

- **Configuración sencilla desde la UI**: Registre el Bot Token y el Chat ID directamente desde el panel de extensiones de AutoAntigravity en la barra lateral.
- **Almacenamiento Seguro**: Mantiene y gestiona la configuración del bot de forma segura utilizando el archivo `.env`.
- **Notificaciones y más**: Sienta las bases para funciones clave como la monitorización del trabajo del agente.

### 🔄 Bucle Ralph (Ralph Loop)
Un sistema de **ejecución iterativa de agentes autónomos** basado en `PRD.md`.

- **Basado en archivos de tareas**: Administra tareas en un formato de casilla de verificación (`- [ ]`) en `PRD.md`.
- **Soporte de tareas en paralelo**: Ejecuta tareas de forma independiente en paralelo mediante el uso de árboles de trabajo (git worktrees) con la etiqueta `#parallel` y las fusiona automáticamente.
- **Seguimiento del progreso**: Registra el resultado de cada iteración utilizando un método de solo adición (append-only) en `progress.txt`.
- **Commits Automáticos**: Realiza commits automáticamente en Git después de cada iteración.
- **Actualización de contexto**: Supera los límites de la ventana de contexto iniciando una nueva sesión para cada iteración.
- **Medidas de Seguridad**: Limita el número máximo de iteraciones.

---

## 🛠 Instalación

### 1. Activar el Modo de Depuración (Requerido)
Agregue el siguiente flag al iniciar Antigravity:

```
--remote-debugging-port=9559
```

**Windows**: Agregar al final del Destino en las Propiedades del acceso directo.  
**Mac**: `open -a "Antigravity" --args --remote-debugging-port=9559`  
**Linux**: Agregar a la línea Exec en su archivo `.desktop`.

> 💡 Después de la instalación, si el puerto está cerrado en la primera ejecución, se mostrará un aviso de parcheo automático.

### 2. Instalar la Extensión
Busque `AutoAntigravity` en el **Panel de Extensiones (Extensions Panel)** de Antigravity para instalarlo directamente.
- [Open VSX Registry: Página de AutoAntigravity](https://open-vsx.org/extension/shinepcsg/AutoAntigravity)

---

## 📖 Uso

### Auto Aceptación
- **Cambiar estado**: Haga clic en `⚡ AutoAccept: ON` / `✕ AutoAccept: OFF` en la barra de estado.
- **Comando**: `Ctrl+Shift+P` → `AutoAntigravity: Toggle Auto Accept`

### 📱 Configuración del Bot de Telegram
Puede conectar un bot de Telegram para monitorear tareas y recibir notificaciones.

1. **Crear el Bot**: Cree un bot mediante `@BotFather` en Telegram y obtenga el **Bot Token**.
2. **Obtener el Chat ID**: Envíe un mensaje al bot o utilice herramientas como `@msid_bot` para obtener su **Chat ID**.
3. **Registrar Configuración**: Abra el panel lateral haciendo clic en el **icono de AutoAntigravity** en la barra de actividad izquierda.
4. Ingrese el Token y su Chat ID en el menú de **Gestión de Integración de Telegram** del panel y guárdelo.
   > 💡 *La información configurada se guarda de manera segura en el archivo `.env` en la raíz del espacio de trabajo.*

### 🔄 Bucle Ralph
1. **Preparar el Archivo de Tareas**: Cree `PRD.md` en su espacio de trabajo (usando un formato de casillas de verificación).
   ```markdown
   - [ ] Implementar endpoint API
   - [ ] Diseñar el esquema de base de datos
   - [ ] Escribir pruebas unitarias
   ```
2. **Iniciar**: `Ctrl+Shift+P` → `AutoAntigravity: Start Ralph Loop`
3. **Detener**: `Ctrl+Shift+P` → `AutoAntigravity: Stop Ralph Loop`

### Registro del flujo de trabajo `/write-prd`

Al usar el comando `/write-prd`, el agente de IA redacta automáticamente un documento PRD y lo aplica al Ralph Loop instantáneamente.  
Para utilizar este flujo de trabajo, debe registrarlo como un **Flujo de trabajo global** o un **Flujo de trabajo del proyecto**.

#### Método 1: Flujo de trabajo del proyecto (Usar solo en el proyecto actual)

Coloque el archivo `.agent/workflows/write-prd.md` en la raíz de su proyecto.  
El archivo ya está incluido en el repositorio de AutoAntigravity, simplemente cópielo para usarlo en otros proyectos.

```
su-proyecto/
├── .agent/
│   └── workflows/
│       └── write-prd.md    ← Colóquelo aquí
├── PRD.md
└── ...
```

> 💡 También se admiten las rutas `.agents/workflows/`, `_agent/workflows/` y `_agents/workflows/`.

#### Método 2: Flujo de trabajo global (Usar en todos los proyectos)

Colocando el archivo en la carpeta `.agent/workflows/` de su directorio de inicio, podrá utilizar el comando `/write-prd` en todos los proyectos.

**Windows** (Ejecutar en la raíz del proyecto):
```powershell
# Crear el directorio de flujo de trabajo global
New-Item -ItemType Directory -Path "$env:USERPROFILE\.agent\workflows" -Force

# Copiar write-prd.md
Copy-Item ".\.agent\workflows\write-prd.md" "$env:USERPROFILE\.agent\workflows\write-prd.md"
```

**Mac / Linux** (Ejecutar en la raíz del proyecto):
```bash
# Crear el directorio de flujo de trabajo global
mkdir -p ~/.agent/workflows

# Copiar write-prd.md
cp ./.agent/workflows/write-prd.md ~/.agent/workflows/write-prd.md
```

Después de registrarlo, escriba `/write-prd` en el chat de Antigravity para ejecutar el flujo de trabajo.

---

### 🔀 Configuración de Tareas Paralelas

Ralph Loop puede ejecutar tareas con la etiqueta `#parallel` simultáneamente en **árboles de trabajo git independientes** (worktrees).

#### Activación

La ejecución en paralelo está habilitada por defecto. Puede controlarse desde la configuración:

| Configuración | Predeterminado | Descripción |
|---|---|---|
| `autoAntigravity.ralphLoop.enableParallel` | `true` | Activar/desactivar la ejecución en paralelo. |
| `autoAntigravity.ralphLoop.maxParallelTasks` | `3` | Número máximo de tareas simultáneas (2~8). |

#### Especificar tareas paralelas en el PRD

Agregue la etiqueta `#parallel` a los elementos de la tarea para ejecutarlos simultáneamente:

```markdown
### Paso 2: Implementar módulos totalmente independientes
- [ ] Tarea #parallel 2-1: Implementar módulo de usuario (src/user.js)
- [ ] Tarea #parallel 2-2: Implementar módulo de productos (src/product.js)
- [ ] Tarea #parallel 2-3: Implementar módulo de pedidos (src/order.js)
- [ ] Validación 2: Asegurar que los módulos pasen las pruebas.
```

#### Reglas para tareas paralelas

- **Las tareas repetitivas con `#parallel`** forman un único grupo paralelo.
- Si se coloca una tarea regular entre ellas, se separarán en **distintos grupos paralelos**.
- Úselo solo para tareas que **modifiquen diferentes archivos** — modificar el mismo archivo generará conflictos de fusión.
- **No use esto** para tareas que dependan directamente de la finalización de otras tareas anteriores en el mismo grupo.

#### Cómo funciona

1. Cuando Ralph Loop detecta un grupo en paralelo, crea un **git worktree independiente** para cada tarea.
2. Agentes de Antigravity completamente separados ejecutarán las tareas en paralelo.
3. Una vez completadas todas las tareas en paralelo, los resultados **se fusionarán automáticamente en la rama principal**.
4. Si se produce un conflicto de fusión, la Inteligencia Artificial intentará resolverlo automáticamente.

---

## ⚙ Configuración

| Configuración | Predeterminado | Descripción |
|---|---|---|
| `autoAntigravity.autoAccept.pollInterval` | `500` | Intervalo de sondeo (ms) |
| `autoAntigravity.autoAccept.cdpPort` | `9559` | Puerto de depuración de CDP |
| `autoAntigravity.autoAccept.customButtonTexts` | `[]` | Textos adicionales de los botones a clicar |
| `autoAntigravity.ralphLoop.maxIterations` | `50` | Máximo de iteraciones |
| `autoAntigravity.ralphLoop.taskFile` | `PRD.md` | Nombre de archivo con las tareas |
| `autoAntigravity.ralphLoop.progressFile` | `progress.txt` | Fichero dónde se registra el progreso |
| `autoAntigravity.ralphLoop.autoCommit` | `true` | Ramificación automática y commit en Git por progreso de tarea completado |
| `autoAntigravity.ralphLoop.autoDeleteBranch` | `true` | Eliminación automática de la rama de trabajo al completarse el progreso. |
| `autoAntigravity.ralphLoop.iterationDelayMs` | `1500` | Retraso temporal (ms) entre ciclos de espera. |
| `autoAntigravity.ralphLoop.allowPrdModification` | `false` | Permite que el agente edite el archivo PRD |
| `autoAntigravity.ralphLoop.autoStart` | `true` | Comienzo Automático en cuanto se realiza algún cambio |
| `autoAntigravity.ralphLoop.enableParallel` | `true` | Capacidad de paralelización |
| `autoAntigravity.ralphLoop.maxParallelTasks` | `3` | Número Máximo simultáneo (2~8) |

---

## 🔒 Seguridad

- Auto Accept opera **únicamente en el interior del panel del agente de Antigravity** (Webview Guard).
- Bajo ningún concepto hace clic en páginas web y URLs externas.
- El CDP se maneja de forma exclusiva para **localhost** — no hay posibilidad de acceso ajeno.
- Ralph Loop controla internamente que jamás entren en loops infinitos estableciendo límites prefijados absolutos.

---

## 📝 Licencia

Licencia MIT — [LICENSE](LICENSE)

## 🙏 Créditos
Chansun Park (shinepcs@gmail.com)
