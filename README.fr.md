[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-cn.md) | [繁體中文](README.zh-tw.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-br.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

---

# AutoAntigravity

Une extension Antigravity qui intègre les fonctions **Auto Accept**, **Telegram** And **Ralph Loop** dans un seul plugin.

---

## ✨ Fonctionnalités Principales

### ⚡ Auto Accept
Accepte automatiquement les **modifications de fichiers, les commandes de terminal et les demandes d'autorisation** suggérées par l'agent Antigravity.

- **CDP (Chrome DevTools Protocol) + MutationObserver** : Détecte les modifications du DOM immédiatement → Clique automatiquement sur les boutons.
- **Sondage VS Code Commands API** : Exécute automatiquement `acceptAgentStep`, `terminalCommand.run`, etc.
- **Boutons Détectés** : `Run`, `Accept`, `Always Allow`, `Allow`, `Retry`, `Continue`
- **Textes de boutons personnalisés pris en charge** (Support multilingue)

### 📱 Intégration d'un Bot Telegram
Surveillez et gérez les flux de travail via un robot Telegram.

- **Configuration de l'interface utilisateur simple** : Enregistrez le jeton du bot (Bot Token) et le numéro de chat (Chat ID) directement à partir du panneau de l'extension AutoAntigravity.
- **Stockage Sécurisé** : Conserve et gère les configurations en toute sécurité en utilisant le fichier `.env`.
- **Notifications & Plus** : Pose les bases d'extensions clés, telles que la surveillance du travail des agents.

### 🔄 Ralph Loop
Un système d'**exécution d'agent autonome itératif** basé sur un fichier `PRD.md`.

- **Basé sur un fichier de tâches** : Gère les tâches dans un format de case à cocher (`- [ ]`) via `PRD.md`.
- **Support des Tâches Parallèles** : Exécute les tâches de manière indépendante en parallèle à l'aide de git worktrees via l'étiquette `#parallel` puis les fusionne automatiquement.
- **Suivi de l'Avancement** : Enregistre le résultat de chaque itération à la fin de `progress.txt` en mode ajout (append-only).
- **Auto Commit** : S'engage automatiquement sur Git après chaque itération.
- **Actualisation du Contexte** : Surmonte les limites de la fenêtre de contexte en démarrant une nouvelle session à chaque itération.
- **Sécurité** : Limite le nombre maximum d'itérations.

---

## 🛠 Installation

### 1. Activer le Mode Débogage (Nécessaire)
Ajoutez ce drapeau lors du lancement d'Antigravity :

```
--remote-debugging-port=9559
```

**Windows** : Ajouter à la fin de la Cible (Target) dans les Propriétés du Raccourci.  
**Mac** : `open -a "Antigravity" --args --remote-debugging-port=9559`  
**Linux** : Ajouter à la ligne Exec dans le fichier `.desktop`.

> 💡 Après l'installation, si le port est fermé lors du premier lancement, un correctif automatique vous sera proposé.

### 2. Installer l'Extension
Recherchez `AutoAntigravity` dans le **Panneau des Extensions (Extensions Panel)** d'Antigravity pour l'installer directement.
- [Open VSX Registry: Page AutoAntigravity](https://open-vsx.org/extension/shinepcsg/AutoAntigravity)

---

## 📖 Utilisation

### Auto Accept
- **Bascule** : Cliquez sur `⚡ AutoAccept: ON` / `✕ AutoAccept: OFF` dans la barre d'état.
- **Commande** : `Ctrl+Shift+P` → `AutoAntigravity: Toggle Auto Accept`

### 📱 Configuration du Bot Telegram
Vous pouvez lier un bot Telegram pour surveiller les tâches et recevoir des notifications.

1. **Créer le Bot** : Créez un robot via `@BotFather` sur Telegram et obtenez un **Bot Token**.
2. **Obtenir le Chat ID** : Envoyez un message au bot ou utilisez des outils comme `@msid_bot` pour obtenir votre **Chat ID**.
3. **Enregistrer la Configuration** : Ouvrez le panneau d'extension en cliquant sur l'**icône AutoAntigravity** dans la barre d'activités à gauche.
4. Entrez votre Jeton (Token) et l'ID du chat dans le menu **Gestion de l'intégration Telegram** puis sauvegardez.
   > 💡 *Les informations configurées sont sauvegardées de manière sécurisée dans le fichier `.env` à la racine de votre espace de travail.*

### 🔄 Ralph Loop
1. **Préparer le fichier de tâches** : Créez `PRD.md` dans l'espace de travail (avec le format case à cocher).
   ```markdown
   - [ ] Implémenter le point d'accès API
   - [ ] Concevoir le schéma de la base de données
   - [ ] Écrire les tests unitaires
   ```
2. **Démarrer** : `Ctrl+Shift+P` → `AutoAntigravity: Start Ralph Loop`
3. **Arrêter** : `Ctrl+Shift+P` → `AutoAntigravity: Stop Ralph Loop`

### Inscription du flux de travail `/write-prd`

En utilisant la commande oblique `/write-prd`, l'agent d'IA rédige automatiquement un PRD et l'applique instantanément à Ralph Loop.

Ouvrez le panneau latéral en cliquant sur l'**icône AutoAntigravity** dans la barre d'activités à gauche,  
puis cliquez sur le bouton **📋 write-prd (Workspace)** dans la section des paramètres pour installer automatiquement le flux de travail dans le projet actuel.

Après l'installation, tapez `/write-prd` dans la discussion d'Antigravity pour exécuter le flux.

---

### 🔀 Configuration des Tâches Parallèles

Ralph Loop peut exécuter des tâches étiquetées avec `#parallel` simultanément dans des **git worktrees indépendants**.

#### Activation

L'exécution parallèle est activée par défaut. Elle peut être contrôlée dans les paramètres :

| Paramètre | Défaut | Description |
|---|---|---|
| `autoAntigravity.ralphLoop.enableParallel` | `true` | Activer/Désactiver l'exécution parallèle |
| `autoAntigravity.ralphLoop.maxParallelTasks` | `3` | Nombre maximum de tâches simultanées (2~8) |

#### Spécifier des Tâches Parallèles dans le PRD

Ajoutez la balise `#parallel` aux éléments de la tâche pour les exécuter en parallèle :

```markdown
### Étape 2 : Implémenter des modules indépendants
- [ ] Tâche #parallel 2-1 : Implémenter le module utilisateur (src/user.js)
- [ ] Tâche #parallel 2-2 : Implémenter le module produit (src/product.js)
- [ ] Tâche #parallel 2-3 : Implémenter le module de commande (src/order.js)
- [ ] Validation 2 : S'assurer que tous les tests unitaires réussissent.
```

#### Règles des Tâches Parallèles

- **Les éléments consécutifs avec `#parallel`** forment un seul groupe parallèle.
- Si une tâche standard est placée entre les deux, elles sont séparées en **groupes parallèles distincts**.
- Utilisez-le **uniquement pour les tâches modifiant différents fichiers** — modifier le même fichier entraînera des conflits de fusion (merge conflicts).
- **Ne pas utiliser** pour des tâches dépendant du résultat des tâches précédentes dans le même groupe.

#### Comment ça marche

1. Lorsque Ralph Loop détecte un groupe parallèle, il crée un **git worktree indépendant** pour chaque tâche.
2. Un agent Antigravity séparé exécute la tâche en parallèle dans chaque espace de travail.
3. Une fois toutes les tâches parallèles terminées, les résultats sont **automatiquement fusionnés dans la branche principale**.
4. Si un conflit de fusion survient, l'IA tentera de le résoudre automatiquement.

---

## ⚙ Paramètres

| Paramètre | Défaut | Description |
|---|---|---|
| `autoAntigravity.autoAccept.pollInterval` | `500` | Intervalle de sondage (ms) |
| `autoAntigravity.autoAccept.cdpPort` | `9559` | Port de débogage CDP |
| `autoAntigravity.autoAccept.customButtonTexts` | `[]` | Textes de boutons additionnels |
| `autoAntigravity.ralphLoop.maxIterations` | `50` | Nombre maximum d'itérations |
| `autoAntigravity.ralphLoop.taskFile` | `PRD.md` | Nom du fichier de tâches |
| `autoAntigravity.ralphLoop.progressFile` | `progress.txt` | Nom de fichier pour la progression |
| `autoAntigravity.ralphLoop.autoCommit` | `true` | Commits et branche générés automatiquement |
| `autoAntigravity.ralphLoop.autoDeleteBranch` | `true` | Suppression automatique de la branche de tâche. |
| `autoAntigravity.ralphLoop.iterationDelayMs` | `1500` | Délai entre les itérations (ms) |
| `autoAntigravity.ralphLoop.allowPrdModification` | `false` | Permet à l'agent de modifier le PRD |
| `autoAntigravity.ralphLoop.autoStart` | `true` | Démarrage automatique de Ralph Loop |
| `autoAntigravity.ralphLoop.enableParallel` | `true` | Activer l'exécution en mode "parallel" |
| `autoAntigravity.ralphLoop.maxParallelTasks` | `3` | Nombre maximum d'exécutions simultanées |

---

## 🔒 Sécurité

- Auto Accept n'opère **qu'à l'intérieur de l'agent Antigravity** (Webview Guard)
- Il ne clique jamais sur les pages Web externes
- CDP est configuré pour **localhost uniquement** — aucun accès réseau externe
- Ralph Loop empêche les boucles infinies.

---

## 📝 Licence

Licence MIT — [LICENSE](LICENSE)

## 🙏 Crédits
Chansun Park (shinepcs@gmail.com)
