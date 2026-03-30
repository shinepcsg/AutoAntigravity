[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-cn.md) | [繁體中文](README.zh-tw.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-br.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

---

# AutoAntigravity

एंटीग्रेविटी के लिए एक एक्सटेंशन जो **Auto Accept (स्वचालित स्वीकार)** और **Ralph Loop (राल्फ लूप)** दोनों को एक ही प्लगइन में एकीकृत करता है।

---

## ✨ मुख्य विशेषताएँ

### ⚡ Auto Accept
एंटीग्रेविटी एजेंट द्वारा सुझाए गए **फ़ाइल संपादन, टर्मिनल कमांड, और अनुमति अनुरोधों** को स्वचालित रूप से स्वीकार करता है।

- **CDP (क्रिप्टोग्राफ़िक डोमेन प्रोटोकॉल - Chrome DevTools Protocol) + MutationObserver**: DOM परिवर्तन तुरंत पहचानता है → स्वचालित रूप से बटन क्लिक करता है
- **VS Code आदेश (Commands) API मतदान (Polling)**: `acceptAgentStep`, `terminalCommand.run`, आदि को स्वचालित रूप से चलाता है
- **पहचाने गए बटन्स**: `Run`, `Accept`, `Always Allow`, `Allow`, `Retry`, `Continue`
- **अतिरिक्त कस्टम बटन टेक्स्ट जोड़ने की सुविधा** (बहु-भाषा समर्थन)

### 🔄 Ralph Loop
`PRD.md` पर आधारित एक **एआई एजेंट की स्वायत्त चलने वाली पुनरावर्ती निष्पादन (Iterative autonomous execution)** प्रणाली।

- **कार्य फ़ाइल पर आधारित**: कार्य को `PRD.md` में एक चेकबॉक्स प्रारूप (`- [ ]`) में प्रबंधित करता है
- **समानांतर कार्य का समर्थन**: `#parallel` टैग की मदद से, git worktree में कार्यों को समानांतर तरीके से चलाता है और स्वचालित रूप से उन्हें मर्ज करता है
- **प्रगति की ट्रैकिंग**: प्रत्येक पुनरावृत्ति के परिणामों को केवल-जुड़ने (append-only) वाले तरीके से `progress.txt` में सहेजता है
- **स्वत: प्रतिबद्ध (Auto Commit)**: प्रत्येक रूप के बाद इसे Git में 자동으로 (Automated) कमिट करता है
- **संदर्भ नव-प्रवर्तन (Context Refresh)**: संदर्भ सीमा को पार करने के लिए प्रत्येक टर्न पर एक नए सत्र (Session) की शुरुआत करता है
- **सुरक्षा गार्ड**: असीमित पुनरावृत्ति को रोकने के लिए, यह अधिकतम टर्न को सीमित करता है

### 📱 टेलीग्राम बॉट एकीकरण
टेलीग्राम बॉट का उपयोग करके अपने कार्य प्रवाह की निगरानी और नियंत्रण करें।

- **सरल यूआई सेटअप**: AutoAntigravity के साइडबार सेटिंग पैनल से बॉट टोकन और चैट आईडी को सीधे दर्ज करें
- **सुरक्षित सहेज (Secure Storage)**: सेटिंग्स को `.env` फ़ाइल में सुरक्षित रखता है
- **अधिसूचना व अन्य चीज़ें**: एजेंट कार्यों की देखरेख जैसे मुख्य एक्सटेंशन के लिए आधार तैयार करता है

---

## 🛠 स्थापना(Installation)

### 1. डिबग मोड सक्षम करें (अनिवार्य)
Antigravity शुरू करते समय यह फ़्लैग जोड़ें:

```
--remote-debugging-port=9559
```

**Windows**: शॉर्टकट की संपत्तियों (Properties) में Target (लक्ष्य) के अंत में जोड़ें  
**Mac**: `open -a "Antigravity" --args --remote-debugging-port=9559`  
**Linux**: `.desktop` फ़ाइल की Exec लाइन में जोड़ें

> 💡 इंस्टाल होने के बाद, यदि पहले इस्तेमाल पर पोर्ट बंद होता है, तो ऑटोमैटिक पैच प्रॉम्प्ट दिखाया जाएगा।

### 2. एक्सटेंशन इंस्टॉल करें
सीधे इंस्टॉल करने के लिए Antigravity के **एक्सटेंशन्स पैनल (Extensions Panel)** में `AutoAntigravity` खोजें।
- [Open VSX Registry: AutoAntigravity पेज](https://open-vsx.org/extension/shinepcsg/AutoAntigravity)

---

## 📖 उपयोग विधि

### Auto Accept
- **टॉगल करें**: स्टेटस बार पर `⚡ AutoAccept: ON` / `✕ AutoAccept: OFF` पर क्लिक करें
- **कमांड**: `Ctrl+Shift+P` → `AutoAntigravity: Toggle Auto Accept`

### 📱 टेलीग्राम बॉट की सेटिंग
आप कार्यों की निगरानी और सूचना प्राप्त करने के लिए टेलीग्राम बॉट को जोड़ सकते हैं।

1. **बॉट बनाएँ**: टेलीग्राम पर `@BotFather` के माध्यम से बॉट बनाएँ और **बॉट टोकन (Bot Token)** प्राप्त करें।
2. **चैट आईडी प्राप्त करें**: बॉट को एक संदेश भेजकर या `@msid_bot` का उपयोग करके अपनी **चैट आईडी (Chat ID)** की जांच करें।
3. **सेटिंग दर्ज करें**: बाईं ओर गतिविधि पट्टी में स्थित **AutoAntigravity आइकन** को दबा कर साइडबार पैनल खोलें।
4. पैनल में **टेलिग्राम एकीकरण प्रबंधन (Telegram Integration Management)** पर अपना टोकन और चैट आईडी भरें।
   > 💡 *यह जानकारी आपके वर्कस्पेस के रूट में मौजूद `.env` फ़ाइल में محفوظ रहती है।*

### 🔄 Ralph Loop
1. **कार्य फ़ाइल तैयार करें**: कार्यक्षेत्र में `PRD.md` बनाएँ (चेकबॉक्स वाले रूप में)
   ```markdown
   - [ ] एपीआई एंडपॉइंट (API endpoint) लागू करें
   - [ ] डेटाबेस स्कीमा (Database schema) को डिज़ाइन करें
   - [ ] यूनिट परीक्षण (Unit tests) लिखें
   ```
2. **शुरू करें**: `Ctrl+Shift+P` → `AutoAntigravity: Start Ralph Loop`
3. **रोकें**: `Ctrl+Shift+P` → `AutoAntigravity: Stop Ralph Loop`

### `/write-prd` कार्यप्रवाह (Workflow) को पंजीकृत करना

स्लैश कमांड `/write-prd` का उपयोग करने पर, AI एजेंट स्वचालित रूप से एक PRD तैयार करता है और इसे तुरंत Ralph Loop में लागू कर देता है।  
इस कार्यप्रवाह का उपयोग करने के लिए, आपको इसे एक **वैश्विक कार्यप्रवाह (Global Workflow)** या **परियोजना कार्यप्रवाह (Project Workflow)** के रूप में पंजीकृत करना होगा।

#### विधि 1: परियोजना कार्यप्रवाह (केवल वर्तमान परियोजना के लिए)

`.agent/workflows/write-prd.md` फ़ाइल को अपने प्रोजेक्ट की मुख्य डायरेक्ट्री (Root) में रखें।  
यह AutoAntigravity रिपॉजिटरी में पहले से मौजूद है, अन्य प्रोजेक्ट्स में इसका उपयोग करने के लिए बस फ़ाइल की प्रतिलिपि (Copy) बनाएँ।

```
your-project/
├── .agent/
│   └── workflows/
│       └── write-prd.md    ← यहाँ रखें
├── PRD.md
└── ...
```

> 💡 इन पथों (paths) का भी समर्थन किया जाता है: `.agents/workflows/`, `_agent/workflows/`, और `_agents/workflows/`

#### विधि 2: वैश्विक कार्यप्रवाह (सभी परियोजनाओं के लिए)

अपने होम डायरेक्टरी के `.agent/workflows/` फ़ोल्डर में फ़ाइल रखकर, आप `/write-prd` कमांड का उपयोग सभी परियोजनाओं में कर सकते हैं।

**Windows** (प्रोजेक्ट के मूल में चलाएं):
```powershell
# वैश्विक कार्यप्रवाह निर्देशिका बनाएँ
New-Item -ItemType Directory -Path "$env:USERPROFILE\.agent\workflows" -Force

# write-prd.md को कॉपी करें
Copy-Item ".\.agent\workflows\write-prd.md" "$env:USERPROFILE\.agent\workflows\write-prd.md"
```

**Mac / Linux** (प्रोजेक्ट के मूल में चलाएं):
```bash
# वैश्विक कार्यप्रवाह निर्देशिका बनाएँ
mkdir -p ~/.agent/workflows

# write-prd.md को कॉपी करें
cp ./.agent/workflows/write-prd.md ~/.agent/workflows/write-prd.md
```

पंजीकरण (Registration) के बाद, कार्यप्रवाह चलाने के लिए Antigravity चैट में `/write-prd` दर्ज करें।

---

### 🔀 समानांतर कार्य स्थापना (Parallel Task Configuration)

Ralph Loop `#parallel` टैग वाले कार्यों को **अलग git worktrees** में एक साथ निष्पादित (Execute) कर सकता है।

#### एक्टिवेशन

समानांतर निष्पादन डिफ़ॉल्ट रूप से चालू (Enable) रहता है। इसे सेटिंग्स से नियंत्रित किया जा सकता है:

| सेटिंग | डिफ़ॉल्ट | वर्णन |
|---|---|---|
| `autoAntigravity.ralphLoop.enableParallel` | `true` | समानांतर निष्पादन चालू/बंद करें |
| `autoAntigravity.ralphLoop.maxParallelTasks` | `3` | एक साथ चलने वाले कार्यों की अधिकतम सीमा (2~8) |

#### PRD में समानांतर कार्य निर्दिष्ट करना

समानांतर तरीके से चलाने के लिए टास्क्स (Tasks) के साथ `#parallel` टैग जोड़ें:

```markdown
### Step 2: स्वतंत्र मॉड्यूल (Independent modules) को लागू करना
- [ ] #parallel कार्य 2-1: उपयोगकर्ता मॉड्यूल (User module) लागू करें (src/user.js)
- [ ] #parallel कार्य 2-2: उत्पाद मॉड्यूल (Product module) लागू करें (src/product.js)
- [ ] #parallel कार्य 2-3: आदेश मॉड्यूल (Order module) लागू करें (src/order.js)
- [ ] सत्यापन 2: परीक्षण करें कि सभी मॉड्यूल सफलतापूर्वक काम कर रहे हैं
```

#### समानांतर कार्यों के नियम
- **लगातार `#parallel` वाले आइटम्स** एक ही समानांतर समूह का हिस्सा बनते हैं।
- यदि उनके बीच कोई साधारण(सांकेतिक) कार्य रखा गया है, तो वे **विपरीत समानांतर समूह** में अलग हो जाते हैं।
- इसे केवल उन कार्यों के लिए उपयोग करें जो **अलग-अलग फाइलों** को बदलते हैं — एक ही फाइल को बदलने से रिज़ॉल्व(Conflict) करने में परेशानी होगी।
- समूह में पहले वाले कार्यों के परिणामों पर निर्भर करने वाले कार्यों का इस्तेमाल **न करें**।

#### यह कैसे काम करता है
1. जब Ralph Loop किसी समानांतर समूह का पता लगाता है, तो यह हर कार्य के लिए एक **स्वतंत्र git worktree** बनाता है।
2. अलग-अलग Antigravity एजेंट प्रत्येक कार्यक्षेत्र में समानांतर रूप से कार्य को संभालता है।
3. सभी समानांतर कार्य समाप्त होने के बाद, परिणाम **मुख्य ब्रांच(Main branch)** में स्वचालित रूप से जुड़ जाते हैं।
4. यदि कोई मर्जिंग(Merge) अड़चन आती है, तो AI उसे स्वचालित रूप से हल करने का प्रयास करता है।

---

## ⚙ सेटिंग्स

| सेटिंग | डिफ़ॉल्ट | विवरण |
|---|---|---|
| `autoAntigravity.autoAccept.pollInterval` | `500` | मतदान अंतराल (मि.से) |
| `autoAntigravity.autoAccept.cdpPort` | `9559` | CDP डीबग पोर्ट |
| `autoAntigravity.autoAccept.customButtonTexts` | `[]` | अतिरिक्त बटन पाठ(texts) |
| `autoAntigravity.ralphLoop.maxIterations` | `50` | अधिकतम लूप पुनरावृत्तियाँ |
| `autoAntigravity.ralphLoop.taskFile` | `PRD.md` | कार्य फ़ाइल का नाम |
| `autoAntigravity.ralphLoop.progressFile` | `progress.txt` | प्रगति फ़ाइल नाम |
| `autoAntigravity.ralphLoop.autoCommit` | `true` | हर कार्य के लिए शाखा व स्वतः गिट कमिट |
| `autoAntigravity.ralphLoop.autoDeleteBranch` | `true` | कार्य खत्म होने पर स्वचालित शाखा विलोपन |
| `autoAntigravity.ralphLoop.iterationDelayMs` | `1500` | अगली बार काम के बीच देरी (मि.से) |
| `autoAntigravity.ralphLoop.allowPrdModification` | `false` | एजेंट को PRD बदलने दें |
| `autoAntigravity.ralphLoop.autoStart` | `true` | PRD बदलते ही आटो-स्टार्ट (auto-start) |
| `autoAntigravity.ralphLoop.enableParallel` | `true` | समानांतर काम चालू करें |
| `autoAntigravity.ralphLoop.maxParallelTasks` | `3` | अधिकतम समानांतर काम (2~8) |

---

## 🔒 सुरक्षा और बचाव

- Auto Accept **केवल Antigravity एजेंट पैनल** के अंदर ही काम करता है (Webview Guard मौजूद है)
- यह बाहरी वेब पेजों पर कोई भी क्लिक नहीं करेगा
- CDP **केवल लोकेलहोस्ट (localhost)** पर काम करता है — बाहरी नेटवर्क पर इसका कोई हस्तक्षेप नहीं है
- Ralph Loop अधिकतम पुनरावृत्तियों को रोककर अनंत लूप (Infinite Loop) में जाने से बचाता है

---

## 📝 लाइसेंस (License)

MIT License — [LICENSE](LICENSE)

## 🙏 श्रेय
चानसन पार्क (shinepcs@gmail.com)
