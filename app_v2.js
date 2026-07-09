// PDF.js worker setup
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const appLayout = document.getElementById('appLayout');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const historyList = document.getElementById('historyList');

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileListDiv = document.getElementById('fileList');
const generateBtn = document.getElementById('generateBtn');
const errorDisplay = document.getElementById('errorDisplay');
const notesContainer = document.getElementById('notesContainer');
const unifiedContent = document.getElementById('unifiedContent');
const downloadBtn = document.getElementById('downloadBtn');

const apiKeySection = document.getElementById('apiKeySection');
const apiKeyInput = document.getElementById('apiKey');
const saveApiBtn = document.getElementById('saveApiBtn');

// Handle API Key Saving
const savedApiKey = localStorage.getItem('smartNoteApiKey');
if (savedApiKey) {
    apiKeySection.style.display = 'none';
}

saveApiBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key.length > 10) {
        localStorage.setItem('smartNoteApiKey', key);
        apiKeySection.style.display = 'none';
        alert("API Key saved securely to your browser!");
    } else {
        alert("Please enter a valid API key.");
    }
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const searchResults = document.getElementById('searchResults');
const processingTimeDisplay = document.getElementById('processingTimeDisplay');

let selectedFiles = [];
let generatedNotesData = [];
let currentNoteIndex = 0;

const paginationControls = document.getElementById('paginationControls');
const prevNoteBtn = document.getElementById('prevNoteBtn');
const nextNoteBtn = document.getElementById('nextNoteBtn');
const pageIndicator = document.getElementById('pageIndicator');

// Initialize mermaid
mermaid.initialize({ startOnLoad: false, theme: 'dark' });

// Database Setup
const localforageStore = localforage.createInstance({ name: "SmartNoteDB" });

// --- AUTHENTICATION LOGIC ---
async function initApp() {
    const currentUser = localStorage.getItem('smartNoteUser');
    if (currentUser) {
        loginScreen.style.display = 'none';
        appLayout.style.display = 'flex';
        await loadHistory();
    }
}

loginBtn.addEventListener('click', () => {
    const username = loginUsername.value.trim();
    const password = loginPassword.value.trim();
    if (username.length < 3 || password.length < 3) {
        loginError.textContent = "Username and password must be at least 3 characters";
        loginError.style.display = 'block';
        return;
    }
    localStorage.setItem('smartNoteUser', username);
    loginScreen.style.display = 'none';
    appLayout.style.display = 'flex';
    loadHistory();
});

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('smartNoteUser');
    appLayout.style.display = 'none';
    loginScreen.style.display = 'flex';
});

initApp();

// --- HISTORY LOGIC ---
async function saveToHistory(title, mode, data) {
    const timestamp = Date.now();
    const item = {
        id: timestamp,
        date: new Date().toLocaleString(),
        title: title,
        mode: mode,
        data: data
    };
    await localforageStore.setItem(timestamp.toString(), item);
    await loadHistory();
}

async function loadHistory() {
    historyList.innerHTML = '';
    const keys = await localforageStore.keys();
    if (keys.length === 0) {
        historyList.innerHTML = '<p class="history-empty">No past sessions found.</p>';
        return;
    }
    
    keys.sort((a, b) => b - a); // Descending
    
    for (const key of keys) {
        const item = await localforageStore.getItem(key);
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
            <div class="history-item-title">${item.title}</div>
            <div class="history-item-date">${item.date}</div>
        `;
        div.addEventListener('click', () => {
            generatedNotesData = item.data;
            currentNoteIndex = 0;
            notesContainer.style.display = 'block';
            renderCurrentNote();
        });
        historyList.appendChild(div);
    }
}

// --- PDF IMAGE EXTRACTION LOGIC REMOVED TO IMPROVE PERFORMANCE ---

// --- DRAG AND DROP ---
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-active');
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-active');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-active');
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
    }
});

dropZone.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
    }
});

function handleFiles(files) {
    const validFiles = Array.from(files).filter(f => 
        f.type === 'application/pdf' || 
        f.name.toLowerCase().endsWith('.pdf') ||
        f.name.toLowerCase().endsWith('.pptx') ||
        f.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );

    if (validFiles.length === 0) {
        showError('Please select valid PDF or PPTX files.');
        return;
    }

    selectedFiles = [...selectedFiles, ...validFiles];
    
    // Remove duplicates by name
    const uniqueFiles = [];
    const names = new Set();
    for (const f of selectedFiles) {
        if (!names.has(f.name)) {
            uniqueFiles.push(f);
            names.add(f.name);
        }
    }
    selectedFiles = uniqueFiles;
    
    // Automatically sort files in numerical/alphabetical order
    selectedFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    
    updateFileList();
    generateBtn.disabled = false;
    hideError();
}

function updateFileList() {
    fileListDiv.innerHTML = '';
    selectedFiles.forEach(file => {
        const div = document.createElement('div');
        div.textContent = `📄 ${file.name}`;
        fileListDiv.appendChild(div);
    });
}

function showError(msg) {
    errorDisplay.style.display = 'block';
    errorDisplay.innerHTML = `<strong>Error:</strong> ${msg}`;
}

function hideError() {
    errorDisplay.style.display = 'none';
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = error => reject(error);
    });
}

async function generateWithFallback(parts, fileName, apiKey, notesDataArray, headingTitle) {
    const fallbackModels = [
        "gemini-3.5-flash", 
        "gemini-2.5-flash", 
        "gemini-3.1-flash-lite-preview", 
        "gemini-flash-latest"
    ];
    
    let response = null;
    let lastErrorMessage = "";
    let rateLimitRetries = 0;

    for (let attempt = 0; attempt < fallbackModels.length; attempt++) {
        const model = fallbackModels[attempt];
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{ parts: parts }],
                    generationConfig: {
                        maxOutputTokens: 8192,
                        temperature: 0.2
                    }
                })
            });

            if (res.ok) {
                response = res;
                break;
            } else {
                const errData = await res.json();
                lastErrorMessage = errData.error?.message || `Error ${res.status}`;
                
                if (res.status === 429 && rateLimitRetries < 3) {
                    rateLimitRetries++;
                    generateBtn.textContent = `Google API limit reached. Pausing for 36 seconds...`;
                    await sleep(36000);
                    attempt--; // Retry this model again after sleeping
                }
            }
        } catch (err) {
            lastErrorMessage = err.message;
        }
    }

    if (!response) {
        throw new Error(`Failed on ${fileName}: ` + (lastErrorMessage || "All Gemini models overloaded."));
    }

    const data = await response.json();
    
    let outputText = "";
    if (data.candidates && data.candidates[0].content.parts[0].text) {
        outputText = data.candidates[0].content.parts[0].text;
    } else {
        throw new Error(`Unexpected response structure for ${fileName}`);
    }

    // Clean markdown if accidentally included
    outputText = outputText.replace(/^```html/m, '').replace(/^```/m, '').trim();

    notesDataArray.push({
        name: fileName,
        html: `
            <h1 style="color:var(--accent-color); border-bottom: 2px solid var(--accent-color); padding-bottom: 10px; margin-top: 40px; margin-bottom: 20px;">
                ${headingTitle}
            </h1>
            ${outputText}
        `
    });
}

generateBtn.addEventListener('click', async () => {
    const apiKey = localStorage.getItem('smartNoteApiKey');
    if (!apiKey) {
        apiKeySection.style.display = 'block';
        showError('Please paste your Gemini API Key and save it first.');
        return;
    }

    if (selectedFiles.length === 0) {
        showError('Please upload at least one PDF or PPTX first.');
        return;
    }

    generateBtn.disabled = true;
    hideError();
    notesContainer.style.display = 'none';
    downloadBtn.style.display = 'none';
    processingTimeDisplay.textContent = ''; // Clear previous time
    
    const startTime = Date.now();
    const mode = document.querySelector('input[name="generationMode"]:checked').value;
    
    // Start Live Timer
    let secondsElapsed = 0;
    let currentProcessingIndex = 0;
    const estimatedTotalSeconds = mode === 'lectures' ? (selectedFiles.length * 15) : (selectedFiles.length * 20); // 15s per lecture, 20s for combined past papers
    
    const timerInterval = setInterval(() => {
        secondsElapsed++;
        let statusText = mode === 'lectures' 
            ? `Analyzing Lecture ${currentProcessingIndex + 1} of ${selectedFiles.length}...`
            : `Analyzing ${selectedFiles.length} Past Papers...`;
            
        generateBtn.textContent = `${statusText} (Elapsed: ${secondsElapsed}s | Est: ~${estimatedTotalSeconds}s)`;
    }, 1000);

    try {
        unifiedContent.innerHTML = "";
        generatedNotesData = [];
        currentNoteIndex = 0;
        notesContainer.style.display = 'block';

        if (mode === 'lectures') {
            for (let i = 0; i < selectedFiles.length; i++) {
                currentProcessingIndex = i; // Update for the timer
                const file = selectedFiles[i];
                
                const base64 = await fileToBase64(file);
                let mimeType = file.type;
                if (!mimeType) {
                    if (file.name.toLowerCase().endsWith('.pdf')) mimeType = 'application/pdf';
                    else if (file.name.toLowerCase().endsWith('.pptx')) mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
                }
                
                const prompt = `
                    You are a rigorous, highly detailed educational assistant. I have attached a lecture file (PDF/PPT).
                    This is for a critical final exam. You MUST extract EVERY SINGLE concept, definition, table, and formula from this specific file.
                    
                    CRITICAL FORMATTING INSTRUCTIONS:
                    - Provide an EXHAUSTIVE, page-by-page breakdown. Do NOT skim or summarize heavily. If it is in the slides, it MUST be in your notes.
                    - ABSOLUTELY IGNORE all slides related to lecture guidelines, grading, syllabus overviews, learning outcomes, or administration. Do NOT summarize them.
                    - NO HEAVY PARAGRAPHS. Use concise bullet points (<ul> and <li>) and short, simple sentences, but do not leave out any details.
                    - English is the primary focus. The English bullet points must be highly accurate and comprehensive.
                    
                    TRANSLATION TOGGLE:
                    - Every user doesn't need Sinhala. Therefore, DO NOT place Sinhala directly inline with the English bullet points.
                    - Instead, for every Main Topic or Section, you MUST wrap the complete Sinhala translation of that entire section inside an interactive HTML details tag.
                    - Example format:
                      <h3>Main Concept Name</h3>
                      <ul>
                        <li>Detailed English bullet point 1...</li>
                        <li>Detailed English bullet point 2...</li>
                      </ul>
                      <details class="translation-toggle">
                        <summary>🗣️ View Sinhala Translation</summary>
                        <div class="sinhala-content">
                           මෙම සංකල්පයේ සිංහල පරිවර්තනය මෙහි ඇතුලත් කරන්න...
                        </div>
                      </details>
                    
                    MATH, CALCULATIONS, AND ALGORITHMS:
                    - NEVER use basic inline text to explain math, equations, or calculations (e.g. CPU scheduling). It is too messy.
                    - If there is a calculation or step-by-step algorithm, YOU MUST format it as a highly readable HTML <table>, OR as a clearly numbered HTML list (<ol>). Show the steps clearly.
                    
                    DIAGRAMS AND TABLES:
                    - Use highly accurate standard HTML <table> tags to draw comparisons or list complex data.
                    
                    SAMPLE QUESTIONS:
                    - At the very end of the notes for THIS file, create a section with 5 practice questions to test understanding, followed by their Sinhala translations.
                    - YOU MUST wrap the entire Sample Questions section in a div like this: <div class="sample-questions"><h2>Sample Questions</h2>...</div>
                    
                    Return the final output as a raw HTML string. Do NOT wrap it in JSON or Markdown blocks.
                `;
                
                const parts = [
                    { inlineData: { mimeType: mimeType, data: base64 } },
                    { text: prompt }
                ];

                await generateWithFallback(parts, file.name, apiKey, generatedNotesData, `📝 Notes for: ${file.name}`);
            }
            
            // Save to History
            await saveToHistory(`Lecture Notes: ${selectedFiles.length} files`, mode, generatedNotesData);
            
        } else {
            // PAST PAPERS MODE
            generateBtn.textContent = `Analyzing ${selectedFiles.length} Past Papers...`;
            const parts = [];
            for (const file of selectedFiles) {
                const base64 = await fileToBase64(file);
                let mimeType = file.type;
                if (!mimeType) {
                    if (file.name.toLowerCase().endsWith('.pdf')) mimeType = 'application/pdf';
                    else if (file.name.toLowerCase().endsWith('.pptx')) mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
                }
                parts.push({ inlineData: { mimeType: mimeType, data: base64 } });
            }

            const promptPastPapers = `
                You are an expert exam predictor and professor. I have attached several past exam papers.
                Your critical task is to deeply analyze these past papers to find recurring patterns and highly tested concepts, and then generate a comprehensive "Guessing Paper" (Mock Exam) for the upcoming final.
                
                CRITICAL INSTRUCTIONS:
                - Generate a complete, challenging exam paper with questions that are extremely likely to appear based on the patterns.
                - Use clear numbers for the questions (e.g., Question 1, Question 2).
                - DO NOT write the answers inline with the questions. The student must be able to read the question and try to solve it first!
                - For EVERY question, you MUST wrap the complete Answer and its Sinhala translation inside an interactive HTML details tag placed directly below the question.
                
                FORMAT FOR EACH QUESTION:
                <h3>Question 1</h3>
                <p>English text of the question here...</p>
                <details class="translation-toggle">
                  <summary>📝 View Answer & Translation</summary>
                  <div class="sinhala-content">
                     <p><strong>English Answer:</strong> Detailed step-by-step answer here...</p>
                     <p><strong>Sinhala Translation:</strong> සිංහල පරිවර්තනය මෙහි ඇතුලත් කරන්න...</p>
                  </div>
                </details>
                
                MATH & CALCULATIONS:
                - If the answer involves math or step-by-step algorithms, format them inside the <details> tag using a highly readable HTML <table> or a numbered list (<ol>). NO inline math text.
                
                Return the final output as a raw HTML string. Do NOT wrap it in JSON or Markdown blocks.
            `;
            
            parts.push({ text: promptPastPapers });
            await generateWithFallback(parts, "Guessing Paper", apiKey, generatedNotesData, `🎯 Ultimate Guessing Paper`);
            
            // Save to History
            await saveToHistory(`Guessing Paper`, mode, generatedNotesData);
        }

        const endTime = Date.now();
        const timeTakenSec = ((endTime - startTime) / 1000).toFixed(1);
        processingTimeDisplay.textContent = `⚡ Processing time: ${timeTakenSec} seconds`;

        renderCurrentNote();
        downloadBtn.style.display = 'inline-block';
        
        // Render mermaid diagrams
        setTimeout(() => {
            mermaid.run({
                querySelector: '.mermaid',
            });
        }, 500);

    } catch (err) {
        showError(err.message);
    } finally {
        clearInterval(timerInterval);
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate Bilingual Notes';
    }
});

function renderCurrentNote() {
    if (generatedNotesData.length === 0) return;
    
    unifiedContent.innerHTML = generatedNotesData[currentNoteIndex].html;
    
    if (generatedNotesData.length > 1) {
        paginationControls.style.display = 'flex';
        pageIndicator.textContent = `Lecture ${currentNoteIndex + 1} of ${generatedNotesData.length}`;
        prevNoteBtn.disabled = currentNoteIndex === 0;
        nextNoteBtn.disabled = currentNoteIndex === generatedNotesData.length - 1;
    } else {
        paginationControls.style.display = 'none';
    }
    
    setTimeout(() => {
        mermaid.run({ querySelector: '.mermaid' });
    }, 500);
}

prevNoteBtn.addEventListener('click', () => {
    if (currentNoteIndex > 0) {
        currentNoteIndex--;
        renderCurrentNote();
    }
});

nextNoteBtn.addEventListener('click', () => {
    if (currentNoteIndex < generatedNotesData.length - 1) {
        currentNoteIndex++;
        renderCurrentNote();
    }
});

// Search AI functionality
searchBtn.addEventListener('click', async () => {
    const question = searchInput.value.trim();
    const apiKey = localStorage.getItem('smartNoteApiKey');
    
    if (!apiKey) {
        alert("Please save your API key first!");
        return;
    }
    
    if (!question) return;
    
    searchBtn.disabled = true;
    searchBtn.textContent = 'Thinking...';
    searchResults.style.display = 'block';
    searchResults.innerHTML = '<p class="loading-text">Analyzing your lecture slides for the answer...</p>';

    try {
        const parts = [];
        
        for (const file of selectedFiles) {
            const base64 = await fileToBase64(file);
            let mimeType = file.type;
            if (!mimeType) {
                if (file.name.toLowerCase().endsWith('.pdf')) mimeType = 'application/pdf';
                else if (file.name.toLowerCase().endsWith('.pptx')) mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
            }
            parts.push({ inlineData: { mimeType: mimeType, data: base64 } });
        }

        const prompt = `
            You are a helpful teaching assistant. I have attached the student's lecture slides.
            The student is asking a question about these slides:
            "${question}"
            
            Please answer their question directly, accurately, and based ONLY on the provided slides.
            Answer in detailed English, followed by a simple Sinhala translation to help them understand.
            Format your output using basic HTML (e.g. <p>, <strong>, <ul>) and use the class "sinhala-font" for Sinhala paragraphs. Do not use markdown blocks.
        `;
        
        parts.push({ text: prompt });

        const fallbackModels = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-3.1-flash-lite-preview", "gemini-flash-latest"];
        let response = null;
        let lastErrorMessage = "";

        for (const model of fallbackModels) {
            try {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: parts }] })
                });
                
                if (res.ok) {
                    response = res;
                    break;
                } else {
                    const errData = await res.json();
                    lastErrorMessage = errData.error?.message;
                }
            } catch (err) {
                lastErrorMessage = err.message;
            }
        }

        if (!response) throw new Error("Failed to get answer from Gemini: " + lastErrorMessage);

        const data = await response.json();
        let answerHtml = data.candidates[0].content.parts[0].text;
        answerHtml = answerHtml.replace(/^```html/m, '').replace(/^```/m, '').trim();
        
        searchResults.innerHTML = answerHtml;

    } catch (err) {
        searchResults.innerHTML = `<p style="color:var(--error)">Error: ${err.message}</p>`;
    } finally {
        searchBtn.disabled = false;
        searchBtn.textContent = 'Ask';
    }
});

// Native Browser Printing for flawless PDFs
downloadBtn.addEventListener('click', () => {
    window.print();
});
