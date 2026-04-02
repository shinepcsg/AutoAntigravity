
const crypto = require('crypto');

const translations = {
    en: {
        update_available: "🆕 Update Available",
        update_now: "⬆ Update Now",
        error_occurred: "❌ Error Occurred",
        on_auto_accept: "ON - Auto Accept Active",
        off: "Auto Accept OFF",
        idle: "IDLE",
        running: "RUNNING",
        quota_paused: "QUOTA PAUSED",
        stopping: "STOPPING...",
        current_iteration: "Current Iteration",
        start: "▶ Start",
        stop: "⏹ Stop",
        task_queue: "📬 Task Queue",
        task_placeholder: "Enter next task...",
        enqueue_task: "📥 Enqueue Task",
        start_task: "🚀 Start Task",
        no_queued_tasks: "No queued tasks",
        task_file: "📋 Task File",
        not_selected: "Not selected",
        sample_prd: "📝 Generate Sample PRD",
        prd_changes: "📝 PRD Changes",
        live_logs: "📜 Live Logs",
        no_logs: "No logs yet",
        ai_quota: "🔋 AI Quota",
        refresh: "🔄",
        connecting: "Connecting...",
        loading_data: "Loading data...",
        no_models: "No models in use",
        reset_calc: "⏱ Reset: calculating...",
        reset_done: "⏱ Reset complete (waiting info)",
        reset_eta: "⏱ Reset in %h h %m m",
        tg_connect: "📡 Connect Telegram",
        tg_disconnect: "📡 Disconnect Telegram",
        tg_detail: "📬 Get Detailed Notifications",
        save: "💾 Save",
        settings: "⚙ Settings",
        max_iter: "Max Iterations",
        iter_delay: "Iteration Delay (sec)",
        allow_prd_mod: "Allow PRD Modification",
        auto_start: "🚀 Auto-start on PRD change",
        auto_commit: "🌿 Git Auto Commit (branch & merge)",
        auto_del_branch: "🗑 Auto Delete Branch (after merge)",
        code_review: "📝 Enable Code Review",
        auto_push: "🚀 Auto Push (on session end)",
        auto_install: "⬆ Auto Install Updates",
        check_updates: "🔍 Check Updates",
        no_git_cred: "⚠ No Git Credentials - auto update disabled.",
        write_prd_ws: "📋 write-prd (Workspace)",
        consecutive_errors: "%err (Consecutive %cnt)",
        tasks_progress: "%completed / %total tasks (%pct%)",
        update_to: "v%old -> v%new",
        update_btn: "⬆ Update v%version",
        media_attached: " 📎%cnt",
        iteration_log: "Iteration %iter",
        added_log: "+%add",
        removed_log: "-%rem",
        ralph_loop_section: "🔄 Ralph Loop",
        code_review_section: "📝 Code Review",
        code_review_model_label: "Review Model"
    },
    ko: {
        update_available: "🆕 업데이트 가능",
        update_now: "⬆ 지금 업데이트",
        error_occurred: "❌ 오류 발생",
        on_auto_accept: "ON — 자동 수락 활성",
        off: "자동 수락 OFF",
        idle: "대기 중 (IDLE)",
        running: "실행 중 (RUNNING)",
        quota_paused: "할당량 일시정지",
        stopping: "정지 중...",
        current_iteration: "현재 반복",
        start: "▶ 시작",
        stop: "⏹ 정지",
        task_queue: "📬 작업 대기열",
        task_placeholder: "다음 작업 내용을 입력하세요...",
        enqueue_task: "📥 대기열 추가",
        start_task: "🚀 작업 시작",
        no_queued_tasks: "예약된 작업이 없습니다",
        task_file: "📋 작업 파일",
        not_selected: "선택되지 않음",
        sample_prd: "📝 샘플 PRD 생성",
        prd_changes: "📝 PRD 변경사항",
        live_logs: "📜 실시간 로그",
        no_logs: "아직 로그가 없습니다",
        ai_quota: "🔋 AI 할당량",
        refresh: "🔄",
        connecting: "연결 중...",
        loading_data: "데이터 불러오는 중...",
        no_models: "사용 중인 모델 없음",
        reset_calc: "⏱ 리셋: 계산 중...",
        reset_done: "⏱ 리셋 완료 (갱신 대기)",
        reset_eta: "⏱ 리셋까지 %h시간 %m분",
        tg_connect: "📡 Telegram 연결",
        tg_disconnect: "📡 Telegram 연결 해제",
        tg_detail: "📬 상세 알림 받기",
        save: "💾 저장",
        settings: "⚙ 설정",
        max_iter: "최대 반복 횟수",
        iter_delay: "반복 지연(초)",
        allow_prd_mod: "PRD 변경 허용",
        auto_start: "🚀 PRD 수정 시 자동 시작",
        auto_commit: "🌿 Git 자동 커밋 (브랜치 및 병합)",
        auto_del_branch: "🗑 자동 브랜치 삭제 (병합 후)",
        code_review: "📝 코드 리뷰 활성화",
        auto_push: "🚀 자동 Push (세션 종료 시)",
        auto_install: "⬆ 자동 업데이트 설치",
        check_updates: "🔍 업데이트 확인",
        no_git_cred: "⚠ Git 권한 없음 — 자동 업데이트 비활성화",
        write_prd_ws: "📋 write-prd (워크스페이스)",
        consecutive_errors: "%err (연속 %cnt회)",
        tasks_progress: "%completed / %total 작업 (%pct%)",
        update_to: "v%old → v%new",
        update_btn: "⬆ v%version 업데이트",
        media_attached: " <span style=\"opacity:0.6;\" title=\"첨부 미디어 %cnt개\">📎%cnt</span>",
        iteration_log: "반복 %iter",
        added_log: "+%add",
        removed_log: "-%rem",
        ralph_loop_section: "🔄 Ralph Loop",
        code_review_section: "📝 코드 리뷰",
        code_review_model_label: "리뷰 모델"
    },
    ja: {
        update_available: "🆕 アップデート利用可能",
        update_now: "⬆ 今すぐアップデート",
        error_occurred: "❌ エラー発生",
        on_auto_accept: "ON — 自動承認アクティブ",
        off: "自動承認 OFF",
        idle: "IDLE",
        running: "RUNNING",
        quota_paused: "QUOTA PAUSED",
        stopping: "STOPPING...",
        current_iteration: "現在の反復",
        start: "▶ 開始",
        stop: "⏹ 停止",
        task_queue: "📬 タスクキュー",
        task_placeholder: "次のタスクを入力...",
        enqueue_task: "📥 タスクを予約",
        start_task: "🚀 タスク開始",
        no_queued_tasks: "予約済みタスクなし",
        task_file: "📋 タスクファイル",
        not_selected: "未選択",
        sample_prd: "📝 サンプルPRD生成",
        prd_changes: "📝 PRD変更履歴",
        live_logs: "📜 ライブログ",
        no_logs: "まだログがありません",
        ai_quota: "🔋 AI クォータ",
        refresh: "🔄",
        connecting: "接続中...",
        loading_data: "データ読込中...",
        no_models: "使用中のモデルなし",
        reset_calc: "⏱ リセット: 計算中...",
        reset_done: "⏱ リセット完了 (更新待ち)",
        reset_eta: "⏱ リセットまで %h時間 %m分",
        tg_connect: "📡 Telegram接続",
        tg_disconnect: "📡 Telegram切断",
        tg_detail: "📬 詳細通知を受け取る",
        save: "💾 保存",
        settings: "⚙ 設定",
        max_iter: "最大反復回数",
        iter_delay: "反復間隔（秒）",
        allow_prd_mod: "PRD変更を許可",
        auto_start: "🚀 PRD変更時に自動開始",
        auto_commit: "🌿 Git 自動コミット",
        auto_del_branch: "🗑 自動ブランチ削除",
        code_review: "📝 コードレビュー",
        auto_push: "🚀 自動Push (セッション終了時)",
        auto_install: "⬆ 自動アップデートインストール",
        check_updates: "🔍 アップデート確認",
        no_git_cred: "⚠ Git権限なし — 自動アップデート無効",
        write_prd_ws: "📋 write-prd (Workspace)",
        consecutive_errors: "%err (連続%cnt回)",
        tasks_progress: "%completed / %total タスク (%pct%)",
        update_to: "v%old → v%new",
        update_btn: "⬆ v%version アップデート",
        media_attached: " 📎%cnt",
        iteration_log: "反復 %iter",
        added_log: "+%add",
        removed_log: "-%rem",
        ralph_loop_section: "🔄 Ralph Loop",
        code_review_section: "📝 コードレビュー",
        code_review_model_label: "レビューモデル"
    },
    "zh-cn": {
        update_available: "🆕 有可用更新",
        update_now: "⬆ 立即更新",
        error_occurred: "❌ 发生错误",
        on_auto_accept: "ON — 自动接受激活",
        off: "自动接受 OFF",
        idle: "IDLE",
        running: "RUNNING",
        quota_paused: "QUOTA PAUSED",
        stopping: "STOPPING...",
        current_iteration: "当前迭代",
        start: "▶ 开始",
        stop: "⏹ 停止",
        task_queue: "📬 任务队列",
        task_placeholder: "输入下一个任务...",
        enqueue_task: "📥 加入队列",
        start_task: "🚀 开始任务",
        no_queued_tasks: "没有已排队的任务",
        task_file: "📋 任务文件",
        not_selected: "未选择",
        sample_prd: "📝 生成示例 PRD",
        prd_changes: "📝 PRD 修改记录",
        live_logs: "📜 实时日志",
        no_logs: "暂无日志",
        ai_quota: "🔋 AI 配额",
        refresh: "🔄",
        connecting: "连接中...",
        loading_data: "数据加载中...",
        no_models: "没有使用中的模型",
        reset_calc: "⏱ 重置: 计算中...",
        reset_done: "⏱ 重置完成 (等待更新)",
        reset_eta: "⏱ 距离重置 %h 小时 %m 分钟",
        tg_connect: "📡 连接 Telegram",
        tg_disconnect: "📡 断开 Telegram",
        tg_detail: "📬 接收详细通知",
        save: "💾 保存",
        settings: "⚙ 设置",
        max_iter: "最大迭代次数",
        iter_delay: "迭代间隔 (秒)",
        allow_prd_mod: "允许修改 PRD",
        auto_start: "🚀 PRD 修改时自动启动",
        auto_commit: "🌿 自动 Git 提交",
        auto_del_branch: "🗑 自动删除分支",
        code_review: "📝 代码审核",
        auto_push: "🚀 会话结束时自动 Push",
        auto_install: "⬆ 自动安装更新",
        check_updates: "🔍 检查更新",
        no_git_cred: "⚠ 无 Git 凭证 — 自动更新已禁用。",
        write_prd_ws: "📋 write-prd (工作区)",
        consecutive_errors: "%err (连续 %cnt 次)",
        tasks_progress: "%completed / %total 任务 (%pct%)",
        update_to: "v%old → v%new",
        update_btn: "⬆ 更新 v%version",
        media_attached: " 📎%cnt",
        iteration_log: "迭代 %iter",
        added_log: "+%add",
        removed_log: "-%rem",
        ralph_loop_section: "🔄 Ralph Loop",
        code_review_section: "📝 代码审核",
        code_review_model_label: "审核模型"
    },
    "zh-tw": {
        update_available: "🆕 有可用更新",
        update_now: "⬆ 立即更新",
        error_occurred: "❌ 發生錯誤",
        on_auto_accept: "ON — 自動接受啟用",
        off: "自動接受 OFF",
        idle: "IDLE",
        running: "RUNNING",
        quota_paused: "QUOTA PAUSED",
        stopping: "STOPPING...",
        current_iteration: "當前迭代",
        start: "▶ 開始",
        stop: "⏹ 停止",
        task_queue: "📬 任務佇列",
        task_placeholder: "輸入下一個任務...",
        enqueue_task: "📥 加入佇列",
        start_task: "🚀 開始任務",
        no_queued_tasks: "沒有已排隊的任務",
        task_file: "📋 任務文件",
        not_selected: "未選擇",
        sample_prd: "📝 生成範例 PRD",
        prd_changes: "📝 PRD 修改記錄",
        live_logs: "📜 即時日誌",
        no_logs: "暫無日誌",
        ai_quota: "🔋 AI 配額",
        refresh: "🔄",
        connecting: "連接中...",
        loading_data: "數據加載中...",
        no_models: "沒有使用中的模型",
        reset_calc: "⏱ 重置: 計算中...",
        reset_done: "⏱ 重置完成 (等待更新)",
        reset_eta: "⏱ 距離重置 %h 小時 %m 分鐘",
        tg_connect: "📡 連接 Telegram",
        tg_disconnect: "📡 斷開 Telegram",
        tg_detail: "📬 接收詳細通知",
        save: "💾 保存",
        settings: "⚙ 設置",
        max_iter: "最大迭代次數",
        iter_delay: "迭代間隔 (秒)",
        allow_prd_mod: "允許修改 PRD",
        auto_start: "🚀 PRD 修改時自動啟動",
        auto_commit: "🌿 自動 Git 提交",
        auto_del_branch: "🗑 自動刪除分支",
        code_review: "📝 程式碼審查",
        auto_push: "🚀 會話結束時自動 Push",
        auto_install: "⬆ 自動安裝更新",
        check_updates: "🔍 檢查更新",
        no_git_cred: "⚠ 無 Git 憑證 — 自動更新已停用。",
        write_prd_ws: "📋 write-prd (工作區)",
        consecutive_errors: "%err (連續 %cnt 次)",
        tasks_progress: "%completed / %total 任務 (%pct%)",
        update_to: "v%old → v%new",
        update_btn: "⬆ 更新 v%version",
        media_attached: " 📎%cnt",
        iteration_log: "迭代 %iter",
        added_log: "+%add",
        removed_log: "-%rem",
        ralph_loop_section: "🔄 Ralph Loop",
        code_review_section: "📝 程式碼審查",
        code_review_model_label: "審查模型"
    },
    es: {
        update_available: "🆕 Actualización Disponible",
        update_now: "⬆ Actualizar Ahora",
        error_occurred: "❌ Ocurrió un Error",
        on_auto_accept: "ON - Aceptación Automática",
        off: "Auto Accept OFF",
        idle: "IDLE",
        running: "RUNNING",
        quota_paused: "QUOTA PAUSED",
        stopping: "STOPPING...",
        current_iteration: "Iteración Actual",
        start: "▶ Iniciar",
        stop: "⏹ Detener",
        task_queue: "📬 Cola de Tareas",
        task_placeholder: "Ingresa la siguiente tarea...",
        enqueue_task: "📥 Encolar Tarea",
        start_task: "🚀 Iniciar Tarea",
        no_queued_tasks: "No hay tareas encoladas",
        task_file: "📋 Archivo de Tareas",
        not_selected: "No seleccionado",
        sample_prd: "📝 Generar PRD de muestra",
        prd_changes: "📝 Cambios en PRD",
        live_logs: "📜 Registros en Vivo",
        no_logs: "No hay registros aún",
        ai_quota: "🔋 Cuota de IA",
        refresh: "🔄",
        connecting: "Conectando...",
        loading_data: "Cargando datos...",
        no_models: "No hay modelos en uso",
        reset_calc: "⏱ Reinicio: calculando...",
        reset_done: "⏱ Reinicio completo",
        reset_eta: "⏱ Reinicio en %h h %m m",
        tg_connect: "📡 Conectar Telegram",
        tg_disconnect: "📡 Desconectar Telegram",
        tg_detail: "📬 Recibir notificaciones detalladas",
        save: "💾 Guardar",
        settings: "⚙ Configuraciones",
        max_iter: "Máx Iteraciones",
        iter_delay: "Retraso (seg)",
        allow_prd_mod: "Permitir modificar PRD",
        auto_start: "🚀 Auto-inicio al cambiar PRD",
        auto_commit: "🌿 Auto Git Commit",
        auto_del_branch: "🗑 Auto Eliminar Rama",
        code_review: "📝 Revisión de Código",
        auto_push: "🚀 Auto Push",
        auto_install: "⬆ Instalar actualizaciones auto",
        check_updates: "🔍 Buscar Actualizaciones",
        no_git_cred: "⚠ Sin credenciales de Git.",
        write_prd_ws: "📋 write-prd (Workspace)",
        consecutive_errors: "%err (Consecutivos %cnt)",
        tasks_progress: "%completed / %total tareas (%pct%)",
        update_to: "v%old -> v%new",
        update_btn: "⬆ Actualizar v%version",
        media_attached: " 📎%cnt",
        iteration_log: "Iteración %iter",
        added_log: "+%add",
        removed_log: "-%rem",
        ralph_loop_section: "🔄 Ralph Loop",
        code_review_section: "📝 Revisión de Código",
        code_review_model_label: "Modelo de Revisión"
    },
    fr: {
        update_available: "🆕 Mise à jour disponible",
        update_now: "⬆ Mettre à jour",
        error_occurred: "❌ Erreur survenue",
        on_auto_accept: "ON - Acceptation Auto",
        off: "Auto Accept OFF",
        idle: "IDLE",
        running: "RUNNING",
        quota_paused: "QUOTA PAUSED",
        stopping: "STOPPING...",
        current_iteration: "Itération actuelle",
        start: "▶ Démarrer",
        stop: "⏹ Arrêter",
        task_queue: "📬 File d'attente",
        task_placeholder: "Entrez la tâche suivante...",
        enqueue_task: "📥 Ajouter à la file",
        start_task: "🚀 Démarrer la tâche",
        no_queued_tasks: "Aucune tâche en file",
        task_file: "📋 Fichier de tâches",
        not_selected: "Non sélectionné",
        sample_prd: "📝 Générer PRD exemple",
        prd_changes: "📝 Changements PRD",
        live_logs: "📜 Logs en direct",
        no_logs: "Aucun log",
        ai_quota: "🔋 Quota IA",
        refresh: "🔄",
        connecting: "Connexion...",
        loading_data: "Chargement...",
        no_models: "Aucun modèle en cours",
        reset_calc: "⏱ Réinitialisation: calcul...",
        reset_done: "⏱ Réinitialisation terminée",
        reset_eta: "⏱ Réinitialisation dans %h h %m m",
        tg_connect: "📡 Connecter Telegram",
        tg_disconnect: "📡 Déconnecter Telegram",
        tg_detail: "📬 Notifications détaillées",
        save: "💾 Enregistrer",
        settings: "⚙ Paramètres",
        max_iter: "Itérations Max",
        iter_delay: "Délai (sec)",
        allow_prd_mod: "Autoriser modif PRD",
        auto_start: "🚀 Démarrage auto sur PRD",
        auto_commit: "🌿 Git Auto Commit",
        auto_del_branch: "🗑 Auto Suppression Branche",
        code_review: "📝 Revue de Code",
        auto_push: "🚀 Auto Push",
        auto_install: "⬆ Installer MAJ auto",
        check_updates: "🔍 Vérifier MAJ",
        no_git_cred: "⚠ Pas de Git.",
        write_prd_ws: "📋 write-prd (Workspace)",
        consecutive_errors: "%err (%cnt consécutives)",
        tasks_progress: "%completed / %total (%pct%)",
        update_to: "v%old -> v%new",
        update_btn: "⬆ Mettre à jour v%version",
        media_attached: " 📎%cnt",
        iteration_log: "Itération %iter",
        added_log: "+%add",
        removed_log: "-%rem",
        ralph_loop_section: "🔄 Ralph Loop",
        code_review_section: "📝 Revue de Code",
        code_review_model_label: "Modèle de Revue"
    },
    de: {
        update_available: "🆕 Update verfügbar",
        update_now: "⬆ Jetzt aktualisieren",
        error_occurred: "❌ Fehler aufgetreten",
        on_auto_accept: "ON - Auto Accept aktiv",
        off: "Auto Accept OFF",
        idle: "IDLE",
        running: "RUNNING",
        quota_paused: "QUOTA PAUSED",
        stopping: "STOPPING...",
        current_iteration: "Aktuelle Iteration",
        start: "▶ Starten",
        stop: "⏹ Stoppen",
        task_queue: "📬 Warteschlange",
        task_placeholder: "Nächste Aufgabe...",
        enqueue_task: "📥 Einreihen",
        start_task: "🚀 Starten",
        no_queued_tasks: "Keine Aufgaben",
        task_file: "📋 Aufgabendatei",
        not_selected: "Nicht ausgewählt",
        sample_prd: "📝 Beispiel-PRD generieren",
        prd_changes: "📝 PRD-Änderungen",
        live_logs: "📜 Live-Logs",
        no_logs: "Noch keine Logs",
        ai_quota: "🔋 KI-Kontingent",
        refresh: "🔄",
        connecting: "Verbinde...",
        loading_data: "Lade Daten...",
        no_models: "Keine Modelle",
        reset_calc: "⏱ Reset: Berechne...",
        reset_done: "⏱ Reset abgeschlossen",
        reset_eta: "⏱ Reset in %h h %m m",
        tg_connect: "📡 Telegram verbinden",
        tg_disconnect: "📡 Telegram trennen",
        tg_detail: "📬 Detaillierte Benachrichtigungen",
        save: "💾 Speichern",
        settings: "⚙ Einstellungen",
        max_iter: "Max Iterationen",
        iter_delay: "Verzögerung (Sek)",
        allow_prd_mod: "PRD-Änderung erlauben",
        auto_start: "🚀 Autostart bei PRD",
        auto_commit: "🌿 Git Auto Commit",
        auto_del_branch: "🗑 Auto Branch löschen",
        code_review: "📝 Code Review",
        auto_push: "🚀 Auto Push",
        auto_install: "⬆ Auto-Installation",
        check_updates: "🔍 Updates prüfen",
        no_git_cred: "⚠ Keine Git-Rechte.",
        write_prd_ws: "📋 write-prd (Workspace)",
        consecutive_errors: "%err (%cnt Mal)",
        tasks_progress: "%completed / %total (%pct%)",
        update_to: "v%old -> v%new",
        update_btn: "⬆ Update v%version",
        media_attached: " 📎%cnt",
        iteration_log: "Iteration %iter",
        added_log: "+%add",
        removed_log: "-%rem",
        ralph_loop_section: "🔄 Ralph Loop",
        code_review_section: "📝 Code Review",
        code_review_model_label: "Review-Modell"
    },
    ru: {
        update_available: "🆕 Доступно обновление",
        update_now: "⬆ Обновить сейчас",
        error_occurred: "❌ Произошла ошибка",
        on_auto_accept: "ON - Авто-принятие",
        off: "Auto Accept OFF",
        idle: "IDLE",
        running: "RUNNING",
        quota_paused: "QUOTA PAUSED",
        stopping: "STOPPING...",
        current_iteration: "Текущая итерация",
        start: "▶ Старт",
        stop: "⏹ Стоп",
        task_queue: "📬 Очередь задач",
        task_placeholder: "Введите задачу...",
        enqueue_task: "📥 В очередь",
        start_task: "🚀 Запуск",
        no_queued_tasks: "Нет задач в очереди",
        task_file: "📋 Файл задач",
        not_selected: "Не выбран",
        sample_prd: "📝 Создать PRD",
        prd_changes: "📝 Изменения PRD",
        live_logs: "📜 Логи онлайн",
        no_logs: "Логов пока нет",
        ai_quota: "🔋 Квота ИИ",
        refresh: "🔄",
        connecting: "Подключение...",
        loading_data: "Загрузка...",
        no_models: "Нет активных",
        reset_calc: "⏱ Сброс: вычисление...",
        reset_done: "⏱ Сброс завершен",
        reset_eta: "⏱ Сброс через %h ч %m м",
        tg_connect: "📡 Подключить Telegram",
        tg_disconnect: "📡 Отключить Telegram",
        tg_detail: "📬 Детальные уведомления",
        save: "💾 Сохранить",
        settings: "⚙ Настройки",
        max_iter: "Макс Итераций",
        iter_delay: "Задержка (сек)",
        allow_prd_mod: "Разрешить изм. PRD",
        auto_start: "🚀 Авто-старт",
        auto_commit: "🌿 Авто Commit",
        auto_del_branch: "🗑 Авто удал. ветку",
        code_review: "📝 Ревью кода",
        auto_push: "🚀 Авто Push",
        auto_install: "⬆ Авто-установка обн.",
        check_updates: "🔍 Проверить",
        no_git_cred: "⚠ Нет доступов Git.",
        write_prd_ws: "📋 write-prd (Workspace)",
        consecutive_errors: "%err (Подряд %cnt)",
        tasks_progress: "%completed / %total (%pct%)",
        update_to: "v%old -> v%new",
        update_btn: "⬆ Обновить v%version",
        media_attached: " 📎%cnt",
        iteration_log: "Итерация %iter",
        added_log: "+%add",
        removed_log: "-%rem",
        ralph_loop_section: "🔄 Ralph Loop",
        code_review_section: "📝 Ревью кода",
        code_review_model_label: "Модель ревью"
    },
    "pt-br": {
        update_available: "🆕 Atualização Disponível",
        update_now: "⬆ Atualizar Agora",
        error_occurred: "❌ Ocorreu um Erro",
        on_auto_accept: "ON - Aceite Automático",
        off: "Auto Accept OFF",
        idle: "IDLE",
        running: "RUNNING",
        quota_paused: "QUOTA PAUSED",
        stopping: "STOPPING...",
        current_iteration: "Iteração Atual",
        start: "▶ Iniciar",
        stop: "⏹ Parar",
        task_queue: "📬 Fila de Tarefas",
        task_placeholder: "Digite a tarefa...",
        enqueue_task: "📥 Adicionar à Fila",
        start_task: "🚀 Iniciar Tarefa",
        no_queued_tasks: "Sem tarefas na fila",
        task_file: "📋 Arquivo de Tarefas",
        not_selected: "Não selecionado",
        sample_prd: "📝 Gerar PRD de amostra",
        prd_changes: "📝 Mudanças PRD",
        live_logs: "📜 Logs ao Vivo",
        no_logs: "Ainda sem logs",
        ai_quota: "🔋 Cota de IA",
        refresh: "🔄",
        connecting: "Conectando...",
        loading_data: "Carregando...",
        no_models: "Sem modelos",
        reset_calc: "⏱ Reset: calculando...",
        reset_done: "⏱ Reset completo",
        reset_eta: "⏱ Reset em %h h %m m",
        tg_connect: "📡 Conectar Telegram",
        tg_disconnect: "📡 Desconectar Telegram",
        tg_detail: "📬 Notificações Detalhadas",
        save: "💾 Salvar",
        settings: "⚙ Configurações",
        max_iter: "Máx Iterações",
        iter_delay: "Atraso (seg)",
        allow_prd_mod: "Modificar PRD",
        auto_start: "🚀 Auto-start",
        auto_commit: "🌿 Auto Git Commit",
        auto_del_branch: "🗑 Auto Deletar Branch",
        code_review: "📝 Verificação de Código",
        auto_push: "🚀 Auto Push",
        auto_install: "⬆ Auto Instalar",
        check_updates: "🔍 Checar updates",
        no_git_cred: "⚠ Sem credenciais Git.",
        write_prd_ws: "📋 write-prd (Workspace)",
        consecutive_errors: "%err (%cnt seguidos)",
        tasks_progress: "%completed / %total (%pct%)",
        update_to: "v%old -> v%new",
        update_btn: "⬆ Atualizar v%version",
        media_attached: " 📎%cnt",
        iteration_log: "Iteração %iter",
        added_log: "+%add",
        removed_log: "-%rem",
        ralph_loop_section: "🔄 Ralph Loop",
        code_review_section: "📝 Verificação de Código",
        code_review_model_label: "Modelo de Verificação"
    },
    hi: {
        update_available: "🆕 अपडेट उपलब्ध",
        update_now: "⬆ अभी अपडेट करें",
        error_occurred: "❌ त्रुटि हुई",
        on_auto_accept: "ON - ऑटो एक्सेप्ट",
        off: "Auto Accept OFF",
        idle: "IDLE",
        running: "RUNNING",
        quota_paused: "QUOTA PAUSED",
        stopping: "STOPPING...",
        current_iteration: "वर्तमान पुनरावृत्ति",
        start: "▶ प्रारंभ",
        stop: "⏹ रोकें",
        task_queue: "📬 कार्य कतार",
        task_placeholder: "कार्य दर्ज करें...",
        enqueue_task: "📥 कतारबद्ध करें",
        start_task: "🚀 कार्य शुरू करें",
        no_queued_tasks: "कतार में कार्य नहीं है",
        task_file: "📋 कार्य फ़ाइल",
        not_selected: "चयनित नहीं",
        sample_prd: "📝 पीआरडी (PRD) बनाएं",
        prd_changes: "📝 पीआरडी परिवर्तन",
        live_logs: "📜 लाइव लॉग",
        no_logs: "कोई लॉग नहीं",
        ai_quota: "🔋 एआई कोटा",
        refresh: "🔄",
        connecting: "जुड़ रहा है...",
        loading_data: "लोड हो रहा है...",
        no_models: "कोई मॉडल नहीं",
        reset_calc: "⏱ रीसेट: गणना...",
        reset_done: "⏱ रीसेट पूर्ण",
        reset_eta: "⏱ रीसेट में %h घंटे %m मिनट",
        tg_connect: "📡 टेलीग्राम कनेक्ट",
        tg_disconnect: "📡 टेलीग्राम डिस्कनेक्ट",
        tg_detail: "📬 विस्तृत सूचनाएं लें",
        save: "💾 सहेजें",
        settings: "⚙ सेटिंग्स",
        max_iter: "अधिकतम लूप",
        iter_delay: "पुनरावृत्ति देरी (सेकंड)",
        allow_prd_mod: "पीआरडी संशोधन की अनुमति दें",
        auto_start: "🚀 ऑटो-स्टार्ट पीआरडी",
        auto_commit: "🌿 गिट ऑटो कमिट",
        auto_del_branch: "🗑 ऑटो ब्रांच हटाएं",
        code_review: "📝 कोड समीक्षा",
        auto_push: "🚀 ऑटो पुश",
        auto_install: "⬆ अपडेट स्वत: इंस्टॉल करें",
        check_updates: "🔍 अपडेट जांचें",
        no_git_cred: "⚠ गिट क्रेडेंशियल्स नहीं हैं।",
        write_prd_ws: "📋 write-prd (कार्यस्थान)",
        consecutive_errors: "%err (%cnt बार)",
        tasks_progress: "%completed / %total कार्य (%pct%)",
        update_to: "v%old -> v%new",
        update_btn: "⬆ अपडेट v%version",
        media_attached: " 📎%cnt",
        iteration_log: "पुनरावृत्ति %iter",
        added_log: "+%add",
        removed_log: "-%rem",
        ralph_loop_section: "🔄 Ralph Loop",
        code_review_section: "📝 कोड समीक्षा",
        code_review_model_label: "समीक्षा मॉडल"
    },
    ar: {
        update_available: "تحديث متاح 🆕",
        update_now: "تحديث الآن ⬆",
        error_occurred: "حدث خطأ ❌",
        on_auto_accept: "نشط - قبول تلقائي ON",
        off: "Auto Accept OFF",
        idle: "IDLE",
        running: "RUNNING",
        quota_paused: "QUOTA PAUSED",
        stopping: "STOPPING...",
        current_iteration: "التكرار الحالي",
        start: "بدء ▶",
        stop: "إيقاف ⏹",
        task_queue: "قائمة المهام 📬",
        task_placeholder: "...أدخل المهمة",
        enqueue_task: "أضف للقائمة 📥",
        start_task: "بدء المهمة 🚀",
        no_queued_tasks: "لا توجد مهام في القائمة",
        task_file: "ملف المهام 📋",
        not_selected: "غير محدد",
        sample_prd: "PRD إنشاء عينة 📝",
        prd_changes: "PRD التغييرات 📝",
        live_logs: "السجلات 📜",
        no_logs: "لا سجلات",
        ai_quota: "حصة الذكاء 🔋",
        refresh: "🔄",
        connecting: "...يتصل",
        loading_data: "...جاري التحميل",
        no_models: "لا توجد نماذج",
        reset_calc: "...إعادة التعيين: حساب ⏱",
        reset_done: "إعادة التعيين اكتملت ⏱",
        reset_eta: "دقيقة %m ساعة %h التعيين في ⏱",
        tg_connect: "اتصال تيليجرام 📡",
        tg_disconnect: "قطع تيليجرام 📡",
        tg_detail: "إشعارات مفصلة 📬",
        save: "حفظ 💾",
        settings: "الإعدادات ⚙",
        max_iter: "أقصى التكرارات",
        iter_delay: "الانتظار (ثانية)",
        allow_prd_mod: "PRD تعديل",
        auto_start: "بدء تلقائي 🚀",
        auto_commit: "حفظ تلقائي جيت 🌿",
        auto_del_branch: "مسح مسار العمل 🗑",
        code_review: "مراجعة الكود 📝",
        auto_push: "دفع تلقائي 🚀",
        auto_install: "التثبيت التلقائي للتحديثات ⬆",
        check_updates: "التحقق من التحديثات 🔍",
        no_git_cred: ".أذونات جيت مفقودة ⚠",
        write_prd_ws: "(المسار) write-prd 📋",
        consecutive_errors: "(متتالي %cnt) %err",
        tasks_progress: "(%pct%) %total / %completed",
        update_to: "v%new <- v%old",
        update_btn: "v%version تحديث ⬆",
        media_attached: " 📎%cnt",
        iteration_log: "التكرار %iter",
        added_log: "+%add",
        removed_log: "-%rem",
        ralph_loop_section: "🔄 Ralph Loop",
        code_review_section: "📝 مراجعة الكود",
        code_review_model_label: "نموذج المراجعة"
    }
};

function getSidebarHtml(webview, langId = 'en') {
    let lang = 'en';
    if(translations[langId]) {
        lang = langId;
    } else {
        const baseLang = langId.split('-')[0];
        if(translations[baseLang]) lang = baseLang;
        else if(translations[langId.toLowerCase()]) lang = langId.toLowerCase();
    }
    const tData = translations[lang] || translations.en;
    
    // JS template string replaces
    function t(key, args) {
        let str = tData[key] || translations.en[key] || key;
        if(args) {
            for(const [k, v] of Object.entries(args)) {
                str = str.replace('%'+k, v);
            }
        }
        return str;
    }

        const nonce = crypto.randomBytes(16).toString('hex');

        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
    :root {
        --bg: var(--vscode-sideBar-background);
        --fg: var(--vscode-sideBar-foreground, var(--vscode-foreground));
        --btn-bg: var(--vscode-button-background);
        --btn-fg: var(--vscode-button-foreground);
        --btn-hover: var(--vscode-button-hoverBackground);
        --btn-secondary-bg: var(--vscode-button-secondaryBackground);
        --btn-secondary-fg: var(--vscode-button-secondaryForeground);
        --input-bg: var(--vscode-input-background);
        --input-fg: var(--vscode-input-foreground);
        --input-border: var(--vscode-input-border, transparent);
        --border: var(--vscode-panel-border, rgba(128,128,128,0.2));
        --danger: var(--vscode-errorForeground, #f44);
        --warning: var(--vscode-editorWarning-foreground, #fa3);
        --success: #4caf50;
        --accent: var(--vscode-focusBorder, #007acc);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size, 13px);
        color: var(--fg);
        background: var(--bg);
        padding: 12px;
        line-height: 1.4;
    }

    .section {
        margin-bottom: 16px;
        padding-bottom: 14px;
        border-bottom: 1px solid var(--border);
    }
    .section:last-child { border-bottom: none; }

    .section-title {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        margin-bottom: 10px;
        opacity: 0.7;
    }

    /* ─── Buttons ─── */
    .btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        width: 100%;
        padding: 7px 12px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
        font-size: 12px;
        font-weight: 500;
        transition: background 0.15s, opacity 0.15s;
    }
    .btn:hover { opacity: 0.9; }
    .btn:active { opacity: 0.7; }

    .btn-primary {
        background: var(--btn-bg);
        color: var(--btn-fg);
    }
    .btn-primary:hover { background: var(--btn-hover); }

    .btn-secondary {
        background: var(--btn-secondary-bg);
        color: var(--btn-secondary-fg);
    }

    .btn-danger {
        background: var(--danger);
        color: #fff;
    }

    .btn-success {
        background: var(--success);
        color: #fff;
    }

    .btn-toggle {
        position: relative;
        overflow: hidden;
    }
    .btn-toggle.active {
        background: var(--warning);
        color: #000;
    }

    .btn + .btn { margin-top: 6px; }

    /* ─── Indicator Pill ─── */
    .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 10px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
    }
    .status-pill .dot {
        width: 7px; height: 7px;
        border-radius: 50%;
    }
    .status-pill.idle   .dot { background: #888; }
    .status-pill.running .dot { background: var(--success); animation: pulse 1.2s infinite; }
    .status-pill.stopping .dot { background: var(--danger); animation: pulse 0.6s infinite; }
    .status-pill.quota_paused .dot { background: var(--warning); animation: pulse 1.8s infinite; }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
    }

    /* ─── Progress ─── */
    .progress-bar-container {
        width: 100%;
        height: 6px;
        background: rgba(128,128,128,0.2);
        border-radius: 3px;
        overflow: hidden;
        margin: 8px 0;
    }
    .progress-bar-fill {
        height: 100%;
        background: var(--accent);
        border-radius: 3px;
        transition: width 0.4s ease;
    }

    .progress-text {
        font-size: 11px;
        opacity: 0.7;
    }

    /* ─── Inputs ─── */
    .form-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
    }
    .form-row label {
        font-size: 12px;
        flex-shrink: 0;
    }
    .form-row input[type="number"] {
        width: 70px;
        padding: 3px 6px;
        background: var(--input-bg);
        color: var(--input-fg);
        border: 1px solid var(--input-border);
        border-radius: 3px;
        font-family: inherit;
        font-size: 12px;
        text-align: right;
    }

    /* ─── Task File ─── */
    .task-file-name {
        font-size: 11px;
        padding: 4px 8px;
        background: var(--input-bg);
        border-radius: 3px;
        word-break: break-all;
        margin-bottom: 8px;
        opacity: 0.85;
        transition: background 0.15s, opacity 0.15s;
    }
    .task-file-name.clickable {
        cursor: pointer;
        text-decoration: underline;
        text-decoration-style: dotted;
        text-underline-offset: 2px;
    }
    .task-file-name.clickable:hover {
        opacity: 1;
        background: rgba(128,128,128,0.25);
    }

    /* ─── Checkbox Toggle ─── */
    .toggle-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
        cursor: pointer;
        font-size: 12px;
    }
    .toggle-row input[type="checkbox"] {
        accent-color: var(--accent);
    }

    /* ─── Iteration Counter ─── */
    .iteration-display {
        font-size: 22px;
        font-weight: 700;
        text-align: center;
        margin: 6px 0;
    }
    .iteration-label { font-size: 11px; text-align: center; opacity: 0.6; }

    /* ─── Spinner ─── */
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    .spinner {
        display: inline-block;
        width: 14px; height: 14px;
        border: 2px solid rgba(255,255,255,0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    /* ─── Error Banner ─── */
    .error-banner {
        display: none;
        background: rgba(244, 67, 54, 0.15);
        border: 1px solid var(--danger);
        border-radius: 4px;
        padding: 8px 10px;
        margin-bottom: 10px;
        font-size: 11px;
    }
    .error-banner.visible { display: block; }
    .error-banner .error-title {
        font-weight: 600;
        color: var(--danger);
        margin-bottom: 4px;
    }
    .error-banner .error-msg {
        opacity: 0.85;
        word-break: break-word;
    }

    /* ─── Log Panel ─── */
    .log-panel {
        max-height: 200px;
        overflow-y: auto;
        background: var(--input-bg);
        border-radius: 4px;
        padding: 6px 8px;
        font-size: 10px;
        font-family: var(--vscode-editor-font-family, monospace);
        line-height: 1.5;
    }
    .log-panel::-webkit-scrollbar {
        width: 5px;
    }
    .log-panel::-webkit-scrollbar-thumb {
        background: rgba(128,128,128,0.4);
        border-radius: 3px;
    }
    .log-line {
        white-space: pre-wrap;
        word-break: break-word;
        padding: 1px 0;
    }
    .log-line .log-time {
        opacity: 0.5;
        margin-right: 4px;
    }
    .log-line.log-error { color: var(--danger); }
    .log-line.log-warn { color: var(--warning); }
    .log-line.log-info { opacity: 0.85; }

    .log-empty {
        opacity: 0.4;
        text-align: center;
        padding: 10px;
        font-size: 11px;
    }

    /* ─── Quota Section ─── */
    .quota-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .quota-refresh-btn {
        background: none;
        border: none;
        color: var(--fg);
        cursor: pointer;
        font-size: 13px;
        opacity: 0.5;
        transition: opacity 0.15s;
        padding: 2px 4px;
    }
    .quota-refresh-btn:hover { opacity: 1; }
    .quota-status {
        font-size: 10px;
        opacity: 0.5;
        margin-bottom: 8px;
    }
    .quota-model {
        margin-bottom: 6px;
    }
    .quota-model-row1 {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        margin-bottom: 3px;
    }
    .quota-model-name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
    }
    .quota-pct {
        font-weight: 600;
        font-size: 11px;
        flex-shrink: 0;
    }
    .quota-model-row2 {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .quota-bar {
        flex: 1;
        height: 5px;
        background: rgba(128,128,128,0.2);
        border-radius: 3px;
        overflow: hidden;
    }
    .quota-bar-fill {
        height: 100%;
        border-radius: 3px;
        transition: width 0.5s ease, background 0.3s;
    }
    .quota-bar-fill.level-ok     { background: #4caf50; }
    .quota-bar-fill.level-caution { background: #ff9800; }
    .quota-bar-fill.level-warn   { background: #f57c00; }
    .quota-bar-fill.level-critical { background: #f44336; }
    .quota-bar-fill.level-empty  { background: #9e9e9e; }
    .quota-reset {
        font-size: 10px;
        opacity: 0.5;
        margin-top: 2px;
    }
    .quota-empty {
        opacity: 0.4;
        text-align: center;
        padding: 10px;
        font-size: 11px;
    }
    .quota-list {
        max-height: 240px;
        overflow-y: auto;
    }
    .quota-list::-webkit-scrollbar { width: 4px; }
    .quota-list::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.3); border-radius: 2px; }

    /* ─── Version Footer ─── */
    .version-footer {
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid var(--border);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        font-size: 10px;
        opacity: 0.45;
        transition: opacity 0.2s;
    }
    .version-footer:hover { opacity: 0.75; }
    .version-footer .version-icon {
        font-size: 12px;
    }

    /* ─── Update Banner ─── */
    .update-banner {
        display: none;
        background: linear-gradient(135deg, rgba(76, 175, 80, 0.15), rgba(33, 150, 243, 0.15));
        border: 1px solid var(--success);
        border-radius: 6px;
        padding: 10px 12px;
        margin-bottom: 12px;
        animation: updatePulse 2s ease-in-out infinite;
    }
    .update-banner.visible { display: block; }
    @keyframes updatePulse {
        0%, 100% { border-color: var(--success); }
        50% { border-color: var(--accent); }
    }
    .update-banner-title {
        font-size: 12px;
        font-weight: 600;
        color: var(--success);
        margin-bottom: 6px;
    }
    .update-banner-version {
        font-size: 11px;
        margin-bottom: 8px;
        opacity: 0.85;
    }
    .update-banner .btn {
        font-size: 11px;
        padding: 5px 10px;
    }

    /* ─── Version Buttons ─── */
    .version-buttons {
        margin-top: 8px;
    }
    .version-buttons:empty {
        display: none;
    }
    .version-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        padding: 5px 10px;
        border: 1px solid rgba(76, 175, 80, 0.3);
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
        font-size: 11px;
        font-weight: 500;
        background: rgba(76, 175, 80, 0.08);
        color: var(--fg);
        transition: background 0.15s, border-color 0.15s;
    }
    .version-btn:hover {
        background: rgba(76, 175, 80, 0.2);
        border-color: var(--success);
    }
    .version-btn:active {
        opacity: 0.7;
    }
    .version-btn + .version-btn {
        margin-top: 4px;
    }

    /* ─── Telegram Section ─── */
    .telegram-section .telegram-status {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
        font-size: 12px;
    }
    .telegram-section .telegram-status-text {
        opacity: 0.85;
    }
    .telegram-form {
        margin-top: 10px;
        padding: 10px;
        background: var(--input-bg);
        border-radius: 6px;
        border: 1px solid var(--border);
    }
    .telegram-form label {
        display: block;
        font-size: 11px;
        margin-bottom: 3px;
        opacity: 0.7;
    }
    .telegram-input {
        width: 100%;
        padding: 5px 8px;
        margin-bottom: 8px;
        background: var(--bg);
        color: var(--input-fg);
        border: 1px solid var(--input-border);
        border-radius: 4px;
        font-family: inherit;
        font-size: 12px;
    }
    .telegram-input:focus {
        outline: 1px solid var(--accent);
    }

    /* ─── Task Queue Section ─── */
    .task-queue-textarea {
        width: 100%;
        padding: 6px 8px;
        margin-bottom: 8px;
        background: var(--input-bg);
        color: var(--input-fg);
        border: 1px solid var(--input-border);
        border-radius: 4px;
        font-family: inherit;
        font-size: 12px;
        resize: vertical;
        line-height: 1.4;
    }
    .task-queue-textarea:focus {
        outline: 1px solid var(--accent);
    }
    .task-queue-list {
        margin-top: 10px;
    }
    .task-queue-item {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        padding: 6px 8px;
        margin-bottom: 4px;
        background: var(--input-bg);
        border-radius: 4px;
        font-size: 11px;
        line-height: 1.4;
    }
    .task-queue-item-text {
        flex: 1;
        word-break: break-word;
        white-space: pre-wrap;
    }
    .task-queue-item-index {
        flex-shrink: 0;
        font-weight: 600;
        opacity: 0.5;
        min-width: 18px;
    }
    .task-queue-delete-btn {
        flex-shrink: 0;
        background: none;
        border: none;
        color: var(--danger);
        cursor: pointer;
        font-size: 12px;
        padding: 0 2px;
        opacity: 0.6;
        transition: opacity 0.15s;
    }
    .task-queue-delete-btn:hover {
        opacity: 1;
    }
    .task-queue-empty {
        opacity: 0.4;
        text-align: center;
        padding: 8px;
        font-size: 11px;
    }

    /* ─── Collapsible Section ─── */
    .collapsible-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        padding: 8px 4px;
        margin-bottom: 4px;
        border-radius: 4px;
        transition: background 0.15s;
        user-select: none;
    }
    .collapsible-header:hover {
        background: rgba(128,128,128,0.1);
    }
    .collapsible-header .section-title {
        margin-bottom: 0;
    }
    .collapsible-chevron {
        font-size: 10px;
        opacity: 0.5;
        transition: transform 0.25s ease;
    }
    .collapsible-header.open .collapsible-chevron {
        transform: rotate(90deg);
    }
    .collapsible-body {
        max-height: 0;
        overflow: hidden;
        transition: max-height 0.3s ease;
    }
    .collapsible-body.open {
        max-height: 3000px;
    }
</style>
</head>
<body>
        <div id="updateVersionText" class="update-banner-version"></div>
    </div>

    <!-- ═══ Error Banner ═══ -->
    <div id="errorBanner" class="error-banner">
        <div class="error-title">${t('error_occurred')}</div>
        <div id="errorMsg" class="error-msg"></div>
    </div>

    <!-- ═══ Auto Accept Section ═══ -->
    <div class="section">
        <button id="btnToggleAutoAccept" class="btn btn-toggle">
            <span id="autoAcceptIcon">🚫</span>
            <span id="autoAcceptLabel">${t('off')}</span>
        </button>
    </div>

    <!-- ═══ Telegram Section ═══ -->
    <div class="section telegram-section">
        <button id="btnToggleTelegram" class="btn btn-toggle">
            ${t('tg_connect')}
        </button>
        <div id="telegramCredForm" class="telegram-form" style="display:none;">
            <label for="inputTelegramToken">Bot Token</label>
            <input id="inputTelegramToken" class="telegram-input" type="text" placeholder="123456:ABC-DEF..." />
            <label for="inputTelegramChatId">Chat ID</label>
            <input id="inputTelegramChatId" class="telegram-input" type="text" placeholder="-100xxxxxxxxxx" />
            <button id="btnSaveTelegramCred" class="btn btn-primary">${t('save')}</button>
        </div>
        <label id="labelTelegramDetail" class="toggle-row" style="display:none;">
            <input id="chkTelegramDetail" type="checkbox" />
            ${t('tg_detail')}
        </label>
    </div>

    <!-- ═══ Ralph Loop Collapsible Section ═══ -->
    <div class="section" style="padding-bottom:0;">
        <div id="ralphCollapsibleHeader" class="collapsible-header">
            <div class="section-title">${t('ralph_loop_section')}</div>
            <span class="collapsible-chevron">▶</span>
        </div>
        <div id="ralphCollapsibleBody" class="collapsible-body">

        <!-- Write PRD Installer -->
        <button id="btnSetWritePrdWorkspace" class="btn btn-primary" style="margin-bottom:14px;">${t('write_prd_ws')}</button>

        <!-- Ralph Loop Status & Controls -->
        <div style="padding-bottom:14px; border-bottom:1px solid var(--border); margin-bottom:16px;">
            <!-- Status -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span id="ralphStatus" class="status-pill idle">
                    <span class="dot"></span>
                    <span id="ralphStatusText">IDLE</span>
                </span>
            </div>

            <!-- Iteration Counter -->
            <div id="iterationArea" style="display:none;">
                <div class="iteration-label">${t('current_iteration')}</div>
                <div id="iterationCount" class="iteration-display">0</div>
            </div>

            <!-- Progress -->
            <div id="progressArea" style="display:none;">
                <div class="progress-bar-container">
                    <div id="progressFill" class="progress-bar-fill" style="width:0%"></div>
                </div>
                <div id="progressText" class="progress-text">0 / 0 tasks</div>
            </div>

        </div>

        <!-- Task Queue -->
        <div style="padding-bottom:14px; border-bottom:1px solid var(--border); margin-bottom:16px;">
            <div class="section-title">${t('task_queue')}</div>
            <textarea id="inputTaskQueue" class="task-queue-textarea" rows="3" placeholder="${t('task_placeholder')}"></textarea>
            <button id="btnEnqueueTask" class="btn btn-primary">${t('enqueue_task')}</button>
            <div id="taskQueueList" class="task-queue-list"></div>
        </div>

        <!-- Task File -->
        <div style="padding-bottom:14px; border-bottom:1px solid var(--border); margin-bottom:16px;">
            <div class="section-title">${t('task_file')}</div>
            <div style="display:flex; align-items:center; gap:4px; margin-bottom:6px;">
                <div id="taskFileName" class="task-file-name" style="flex:1; margin-bottom:0;">${t('not_selected')}</div>
                <button id="btnSelectTaskFile" class="btn btn-secondary" style="width:auto; flex-shrink:0; padding:4px 8px;">📂</button>
            </div>
            <button id="btnGenerateSamplePrd" class="btn btn-secondary" style="margin-bottom:8px;">
                ${t('sample_prd')}
            </button>

            <!-- Moved Controls -->
            <label id="labelAutoStart" class="toggle-row" style="margin-bottom:8px;">
                <input id="chkAutoStart" type="checkbox" />
                ${t('auto_start')}
            </label>

            <button id="btnStartRalph" class="btn btn-success">
                ${t('start')}
            </button>
            <button id="btnStopRalph" class="btn btn-secondary" style="display:none;">
                ${t('stop')}
            </button>
        </div>

        <!-- PRD Changes -->
        <div id="prdChangesSection" style="display:none; padding-bottom:14px; border-bottom:1px solid var(--border); margin-bottom:16px;">
            <div class="section-title">${t('prd_changes')}</div>
            <div id="prdChangesPanel" class="log-panel" style="max-height:140px;"></div>
        </div>


        <!-- Settings -->
        <div style="padding-bottom:8px;">
            <div class="section-title">${t('settings')}</div>
            <div class="form-row">
                <label>${t('max_iter')}</label>
                <input id="inputMaxIter" type="number" min="1" max="999" value="50" />
            </div>
            <div class="form-row">
                <label>${t('iter_delay')}</label>
                <input id="inputDelay" type="number" min="0.5" max="120" step="0.5" value="1.5" />
            </div>

            <label id="labelAllowPrdMod" class="toggle-row">
                <input id="chkAllowPrdMod" type="checkbox" />
                ${t('allow_prd_mod')}
            </label>


            <label id="labelAutoCommit" class="toggle-row">
                <input id="chkAutoCommit" type="checkbox" />
                ${t('auto_commit')}
            </label>
            <label id="labelAutoDeleteBranch" class="toggle-row">
                <input id="chkAutoDeleteBranch" type="checkbox" />
                ${t('auto_del_branch')}
            </label>

            <label id="labelAutoPush" class="toggle-row">
                <input id="chkAutoPush" type="checkbox" />
                ${t('auto_push')}
            </label>

        </div>

        </div><!-- end collapsible-body -->
    </div><!-- end Ralph Loop collapsible section -->

    <!-- ═══ Code Review Collapsible Section ═══ -->
    <div class="section" style="padding-bottom:0;">
        <div id="codeReviewCollapsibleHeader" class="collapsible-header">
            <div class="section-title">${t('code_review_section')}</div>
            <span class="collapsible-chevron">▶</span>
        </div>
        <div id="codeReviewCollapsibleBody" class="collapsible-body">
            <div style="padding-bottom:8px;">
                <label id="labelEnableCodeReview" class="toggle-row">
                    <input id="chkEnableCodeReview" type="checkbox" />
                    ${t('code_review')}
                </label>

                <div class="form-row" id="codeReviewModelRow">
                    <label>${t('code_review_model_label')}</label>
                    <select id="selectCodeReviewModel" style="width:100%;padding:4px 8px;background:var(--input-bg);color:var(--input-fg);border:1px solid var(--input-border);border-radius:4px;font-family:inherit;font-size:12px;">
                        <option value="flash">Gemini Flash</option>
                        <option value="gemini pro">Gemini Pro</option>
                        <option value="gemini pro high">Gemini Pro (High)</option>
                        <option value="opus">Claude Opus</option>
                        <option value="sonnet">Claude Sonnet</option>
                        <option value="gpt">GPT</option>
                    </select>
                </div>
            </div>
        </div><!-- end code review collapsible-body -->
    </div><!-- end Code Review collapsible section -->

    <!-- ═══ AI Quota Section ═══ -->
    <div class="section" id="quotaSection">
        <div class="quota-header">
            <div class="section-title">${t('ai_quota')}</div>
            <button id="btnRefreshQuota" class="quota-refresh-btn" title="새로고침">🔄</button>
        </div>
        <div id="quotaStatus" class="quota-status">${t('connecting')}</div>
        <div id="quotaList" class="quota-list">
            <div class="quota-empty">${t('loading_data')}</div>
        </div>
    </div>

    <!-- ═══ Live Logs Section ═══ -->
    <div class="section">
        <div class="section-title">${t('live_logs')}</div>
        <div id="logPanel" class="log-panel">
            <div class="log-empty">${t('no_logs')}</div>
        </div>
    </div>

    <!-- ═══ Version Footer ═══ -->
    <div class="version-footer">
        <span class="version-icon">🚀</span>
        <span>AutoAntigravity</span>
        <span id="versionText">v--</span>
    </div>

<script nonce="${nonce}">

    const __LOCALES__ = ${JSON.stringify(tData)};
    function t(key, args) {
        let str = __LOCALES__[key] || key;
        if(args) {
            for(const [k, v] of Object.entries(args)) {
                str = str.replace('%'+k, v);
            }
        }
        return str;
    }
    const vscodeApi = acquireVsCodeApi();
    let currentTaskFilePath = null;

    // ─── Collapsible Ralph Loop Section ─────
    const _ralphHeader = document.getElementById('ralphCollapsibleHeader');
    const _ralphBody = document.getElementById('ralphCollapsibleBody');
    _ralphHeader.addEventListener('click', () => {
        _ralphHeader.classList.toggle('open');
        _ralphBody.classList.toggle('open');
    });
    function _ensureRalphOpen() {
        if (!_ralphBody.classList.contains('open')) {
            _ralphHeader.classList.add('open');
            _ralphBody.classList.add('open');
        }
    }

    // ─── Collapsible Code Review Section ─────
    const _crHeader = document.getElementById('codeReviewCollapsibleHeader');
    const _crBody = document.getElementById('codeReviewCollapsibleBody');
    _crHeader.addEventListener('click', () => {
        _crHeader.classList.toggle('open');
        _crBody.classList.toggle('open');
    });

    // ─── Event Bindings (CSP-safe, no inline onclick) ─────
    document.getElementById('btnToggleAutoAccept').addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'toggleAutoAccept' });
    });
    document.getElementById('btnStartRalph').addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'startRalph' });
    });
    document.getElementById('btnStopRalph').addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'stopRalph' });
    });
    document.getElementById('btnSelectTaskFile').addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'selectTaskFile' });
    });
    document.getElementById('btnGenerateSamplePrd').addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'generateSamplePrd' });
    });
    document.getElementById('btnRefreshQuota').addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'refreshQuota' });
    });
    document.getElementById('taskFileName').addEventListener('click', () => {
        if (currentTaskFilePath) {
            vscodeApi.postMessage({ command: 'openTaskFile', filePath: currentTaskFilePath });
        }
    });
    document.getElementById('inputMaxIter').addEventListener('change', (e) => {
        vscodeApi.postMessage({ command: 'setMaxIterations', value: parseInt(e.target.value, 10) || 50 });
    });
    document.getElementById('inputDelay').addEventListener('change', (e) => {
        vscodeApi.postMessage({ command: 'setIterationDelay', value: (parseInt(e.target.value, 10) || 3) * 1000 });
    });

    document.getElementById('labelAllowPrdMod').addEventListener('click', (e) => {
        e.preventDefault();
        vscodeApi.postMessage({ command: 'toggleAllowPrdMod' });
    });
    document.getElementById('labelAutoStart').addEventListener('click', (e) => {
        e.preventDefault();
        vscodeApi.postMessage({ command: 'toggleAutoStart' });
    });
    document.getElementById('labelAutoCommit').addEventListener('click', (e) => {
        e.preventDefault();
        vscodeApi.postMessage({ command: 'toggleAutoCommit' });
    });
    document.getElementById('labelAutoDeleteBranch').addEventListener('click', (e) => {
        e.preventDefault();
        vscodeApi.postMessage({ command: 'toggleAutoDeleteBranch' });
    });
    document.getElementById('labelAutoPush').addEventListener('click', (e) => {
        e.preventDefault();
        vscodeApi.postMessage({ command: 'toggleAutoPush' });
    });
    document.getElementById('labelEnableCodeReview').addEventListener('click', (e) => {
        e.preventDefault();
        vscodeApi.postMessage({ command: 'toggleEnableCodeReview' });
    });
    document.getElementById('selectCodeReviewModel').addEventListener('change', (e) => {
        vscodeApi.postMessage({ command: 'setCodeReviewModel', value: e.target.value });
    });

    document.getElementById('btnToggleTelegram').addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'toggleTelegram' });
    });
    document.getElementById('labelTelegramDetail').addEventListener('click', (e) => {
        e.preventDefault();
        vscodeApi.postMessage({ command: 'toggleTelegramDetail' });
    });
    document.getElementById('btnSaveTelegramCred').addEventListener('click', () => {
        const botToken = document.getElementById('inputTelegramToken').value.trim();
        const chatId = document.getElementById('inputTelegramChatId').value.trim();
        vscodeApi.postMessage({ command: 'saveTelegramCred', botToken, chatId });
    });
    document.getElementById('btnSetWritePrdWorkspace').addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'setWritePrdWorkspace' });
    });

    document.getElementById('btnEnqueueTask').addEventListener('click', () => {
        const text = document.getElementById('inputTaskQueue').value.trim();
        if (text) {
            vscodeApi.postMessage({ command: 'enqueueTask', text });
            document.getElementById('inputTaskQueue').value = '';
        }
    });
    document.getElementById('taskQueueList').addEventListener('click', (e) => {
        const btn = e.target.closest('.task-queue-delete-btn');
        if (btn && btn.dataset.index !== undefined) {
            vscodeApi.postMessage({ command: 'dequeueTask', index: parseInt(btn.dataset.index, 10) });
        }
    });

    // ─── State Handling ────────────────────────────────────
    window.addEventListener('message', (event) => {
        const { command, state } = event.data;
        if (command === 'updateState') {
            applyState(state);
        }
    });

    function applyState(s) {
        // Auto Accept
        const btn = document.getElementById('btnToggleAutoAccept');
        const label = document.getElementById('autoAcceptLabel');
        if (s.autoAcceptEnabled) {
            btn.classList.add('active');
            label.textContent = t('on_auto_accept');
        } else {
            btn.classList.remove('active');
            label.textContent = t('off');
        }

        // Error Banner
        const errorBanner = document.getElementById('errorBanner');
        const errorMsg = document.getElementById('errorMsg');
        if (s.lastError) {
            errorBanner.classList.add('visible');
            errorMsg.textContent = t('consecutive_errors', { err: s.lastError, cnt: s.consecutiveErrors });
        } else {
            errorBanner.classList.remove('visible');
        }

        // Ralph Status
        const pill = document.getElementById('ralphStatus');
        const statusText = document.getElementById('ralphStatusText');
        pill.className = 'status-pill ' + s.ralphState;

        const iterArea = document.getElementById('iterationArea');
        const progressArea = document.getElementById('progressArea');
        const btnStart = document.getElementById('btnStartRalph');
        const btnStop = document.getElementById('btnStopRalph');

         switch (s.ralphState) {
            case 'running':
                _ensureRalphOpen();
                pill.style.display = '';
                statusText.textContent = t('running');
                iterArea.style.display = 'block';
                progressArea.style.display = 'block';
                btnStart.style.display = 'none';
                btnStop.style.display = '';
                break;
            case 'quota_paused':
                pill.style.display = '';
                statusText.textContent = t('quota_paused');
                iterArea.style.display = 'block';
                progressArea.style.display = 'block';
                btnStart.style.display = 'none';
                btnStop.style.display = '';
                break;
            case 'stopping':
                pill.style.display = '';
                statusText.textContent = t('stopping');
                progressArea.style.display = 'none';
                btnStart.style.display = 'none';
                btnStop.style.display = 'none';
                break;
            default:
                pill.style.display = 'none';
                statusText.textContent = t('idle');
                iterArea.style.display = 'none';
                progressArea.style.display = 'none';
                btnStart.style.display = (s.taskFile && s.taskFileExists && !s.autoStart) ? '' : 'none';
                btnStop.style.display = 'none';
        }

        // Iteration
        document.getElementById('iterationCount').textContent = s.currentIteration || 0;

        // Progress
        if (s.progress && s.progress.total > 0) {
            const pct = Math.round((s.progress.completed / s.progress.total) * 100);
            document.getElementById('progressFill').style.width = pct + '%';
            document.getElementById('progressText').textContent =
                t('tasks_progress', { completed: s.progress.completed, total: s.progress.total, pct: pct });
        }

        // Task file
        const taskFileEl = document.getElementById('taskFileName');
        if (s.taskFile) {
            currentTaskFilePath = s.taskFile;
            const parts = s.taskFile.replace(/\\\\/g, '/').split('/');
            taskFileEl.textContent = parts[parts.length - 1];
            taskFileEl.classList.add('clickable');
            taskFileEl.title = s.taskFile;
        } else {
            currentTaskFilePath = null;
            taskFileEl.textContent = t('not_selected');
            taskFileEl.classList.remove('clickable');
            taskFileEl.title = '';
        }

        // Generate Sample PRD button visibility
        const btnPrd = document.getElementById('btnGenerateSamplePrd');
        btnPrd.style.display = (s.taskFile && s.taskFileExists) ? 'none' : '';

        // Settings
        document.getElementById('inputMaxIter').value = s.maxIterations;
        document.getElementById('inputDelay').value = s.iterationDelay / 1000;

        document.getElementById('chkAllowPrdMod').checked = s.allowPrdModification || false;
        document.getElementById('chkAutoStart').checked = s.autoStart || false;
        document.getElementById('chkAutoCommit').checked = !!s.autoCommit;
        document.getElementById('chkAutoDeleteBranch').checked = !!s.autoDeleteBranch;
        document.getElementById('chkAutoPush').checked = !!s.autoPush;
        document.getElementById('chkEnableCodeReview').checked = !!s.enableCodeReview;
        document.getElementById('selectCodeReviewModel').value = s.codeReviewModel || 'flash';
        // Show/hide model row based on code review enabled
        document.getElementById('codeReviewModelRow').style.display = s.enableCodeReview ? '' : 'none';

        // Version
        if (s.version) {
            document.getElementById('versionText').textContent = 'v' + s.version;
        }

        // ─── Telegram ───
        const tgBtn = document.getElementById('btnToggleTelegram');
        const tgCredForm = document.getElementById('telegramCredForm');

        if (s.telegramConnected) {
            tgBtn.classList.add('active');
            tgBtn.innerHTML = t('tg_disconnect');
            tgCredForm.style.display = 'none';
            document.getElementById('labelTelegramDetail').style.display = '';
            document.getElementById('chkTelegramDetail').checked = !!s.telegramDetailedNotification;
        } else {
            tgBtn.classList.remove('active');
            tgBtn.innerHTML = t('tg_connect');
            tgCredForm.style.display = s.showTelegramCredForm ? '' : 'none';
            document.getElementById('labelTelegramDetail').style.display = 'none';
        }

        // write-prd 버튼 표시/숨김
        document.getElementById('btnSetWritePrdWorkspace').style.display = s.hasWritePrdWorkspace ? 'none' : '';

        // ─── Task Queue ───
        const queueList = document.getElementById('taskQueueList');
        const queueArr = s.taskQueue || [];
        if (queueArr.length === 0) {
            queueList.innerHTML = '<div style="opacity:0.4;text-align:center;padding:8px;font-size:11px;">'+t('no_queued_tasks')+'</div>';
        } else {
            let qhtml = '';
            for (let i = 0; i < queueArr.length; i++) {
                    const item = queueArr[i];
                    const itemText = typeof item === 'string' ? item : (item.text || '');
                    const mediaCount = (item.mediaPaths && item.mediaPaths.length) || 0;
                    const mediaTag = mediaCount > 0 ? t('media_attached', {cnt: mediaCount}) : '';
                    qhtml += '<div style="display:flex;align-items:flex-start;gap:6px;padding:5px 6px;background:var(--input-bg);border-radius:3px;margin-bottom:4px;font-size:11px;">'
                    + '<span style="flex:1;white-space:pre-wrap;word-break:break-word;">' + escapeHtml(itemText) + mediaTag + '</span>'
                    + '<button class="task-queue-delete-btn" data-index="' + i + '" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:13px;padding:0 2px;flex-shrink:0;" title="삭제">✕</button>'
                    + '</div>';
            }
            queueList.innerHTML = qhtml;
        }

        // ─── Task Queue Button Text (idle → 작업 시작, running → 작업 예약) ───
        const btnEnqueue = document.getElementById('btnEnqueueTask');
        if (s.ralphState === 'idle') {
            btnEnqueue.innerHTML = t('start_task');
        } else {
            btnEnqueue.innerHTML = t('enqueue_task');
        }

        // PRD Changes
        updatePrdChangesPanel(s.prdChanges || []);

        // Logs
        updateLogPanel(s.recentLogs || []);

        // Quota
        updateQuotaPanel(s.quota || { connected: false, models: [] });
    }

    function updatePrdChangesPanel(changes) {
        const section = document.getElementById('prdChangesSection');
        const panel = document.getElementById('prdChangesPanel');
        if (!changes || changes.length === 0) {
            section.style.display = 'none';
            return;
        }
        section.style.display = '';
        let html = '';
        for (const c of changes) {
            html += '<div class="log-line log-warn">';
            html += '<strong>'+t('iteration_log', {iter: c.iteration})+'</strong> ';
            if (c.added && c.added.length > 0) {
                html += '<span style="color:var(--success)">'+t('added_log', {add: c.added.length})+'</span> ';
            }
            if (c.removed && c.removed.length > 0) {
                html += '<span style="color:var(--danger)">'+t('removed_log', {rem: c.removed.length})+'</span>';
            }
            html += '</div>';
            if (c.added) {
                for (const t of c.added) {
                    html += '<div class="log-line log-info" style="color:var(--success);padding-left:12px;">➕ ' + escapeHtml(t.substring(0, 50)) + '</div>';
                }
            }
            if (c.removed) {
                for (const t of c.removed) {
                    html += '<div class="log-line log-info" style="color:var(--danger);padding-left:12px;">➖ ' + escapeHtml(t.substring(0, 50)) + '</div>';
                }
            }
        }
        panel.innerHTML = html;
        panel.scrollTop = panel.scrollHeight;
    }

    function updateLogPanel(logs) {
        const panel = document.getElementById('logPanel');
        if (!logs || logs.length === 0) {
            panel.innerHTML = '<div class="log-empty">' + t('no_logs') + '</div>';
            return;
        }

        let html = '';
        for (const entry of logs) {
            const levelClass = 'log-' + (entry.level || 'info');
            const escapedMsg = escapeHtml(entry.msg);
            html += '<div class="log-line ' + levelClass + '">'
                + '<span class="log-time">' + escapeHtml(entry.time) + '</span>'
                + escapedMsg
                + '</div>';
        }
        panel.innerHTML = html;
        // Auto-scroll to bottom
        panel.scrollTop = panel.scrollHeight;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ─── Quota Panel ──────────────────────────────────────
    let quotaCountdownTimer = null;
    let lastQuotaModels = [];

    function updateQuotaPanel(quota) {
        const sectionEl = document.getElementById('quotaSection');
        const statusEl = document.getElementById('quotaStatus');
        const listEl = document.getElementById('quotaList');

        if (!quota.connected) {
            sectionEl.style.display = 'none';
            return;
        }

        const allModels = quota.models || [];
        // 현재 사용 중인 모델만 필터 (remaining < 1.0 = 쿼타가 소비된 모델)
        const models = allModels.filter(m => m.remaining < 1.0);

        if (allModels.length === 0) {
            sectionEl.style.display = 'none';
            return;
        }

        sectionEl.style.display = '';
        lastQuotaModels = allModels;

        if (models.length === 0) {
            statusEl.textContent = '';
            listEl.innerHTML = '<div class="quota-empty">'+t('no_models')+'</div>';
            return;
        }

        statusEl.textContent = '';

        let html = '';
        for (const m of models) {
            const pct = Math.round(m.remaining * 100);
            const level = pct > 40 ? 'ok' : pct > 20 ? 'caution' : pct > 5 ? 'warn' : pct > 0 ? 'critical' : 'empty';
            const colorVar = level === 'ok' ? 'success' : level === 'caution' ? 'warning' : 'danger';

            html += '<div class="quota-model">';
            // Row 1: 모델명 + 퍼센트
            html += '<div class="quota-model-row1">';
            if (m.isGroup && m.members && m.members.length > 0) {
                const memberTooltip = m.members.map(n => escapeHtml(n)).join('&#10;');
                html += '<span class="quota-model-name" title="' + memberTooltip + '">'
                    + escapeHtml(m.label)
                    + ' <span style="opacity:0.5;font-size:10px;">(' + m.members.length + ')</span>'
                    + '</span>';
            } else {
                html += '<span class="quota-model-name" title="' + escapeHtml(m.label) + '">' + escapeHtml(m.label) + '</span>';
            }
            html += '<span class="quota-pct" style="color:var(--' + colorVar + ')">' + pct + '%</span>';
            html += '</div>';
            // Row 2: 프로그레스바
            html += '<div class="quota-model-row2">';
            html += '<div class="quota-bar"><div class="quota-bar-fill level-' + level + '" style="width:' + pct + '%"></div></div>';
            html += '</div>';

            if (m.resetTime) {
                html += '<div class="quota-reset" data-reset="' + escapeHtml(m.resetTime) + '">' + t('reset_calc') + '</div>';
            }
            html += '</div>';
        }
        listEl.innerHTML = html;

        // Start countdown updates
        updateResetCountdowns();
    }

    function updateResetCountdowns() {
        if (quotaCountdownTimer) clearInterval(quotaCountdownTimer);
        
        const tick = () => {
            const els = document.querySelectorAll('.quota-reset[data-reset]');
            if (els.length === 0) { clearInterval(quotaCountdownTimer); return; }
            const now = Date.now();
            els.forEach(el => {
                const resetStr = el.getAttribute('data-reset');
                const resetMs = new Date(resetStr).getTime();
                const diff = resetMs - now;
                if (diff <= 0) {
                    el.textContent = t('reset_done');
                } else {
                    const h = Math.floor(diff / 3600000);
                    const m = Math.floor((diff % 3600000) / 60000);
                    el.textContent = t('reset_eta', { h: h, m: m });
                }
            });
        };

        tick(); // immediate update
        quotaCountdownTimer = setInterval(tick, 60000);
    }

    // Request initial state
    vscodeApi.postMessage({ command: 'ready' });
</script>
</body>
</html>`;
    }
module.exports = { getSidebarHtml };
