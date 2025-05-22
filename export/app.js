const configuration = {
    apiKey: ""
};


let documentEmbeddings = [];
let documentChunks = [];
const CHUNK_SIZE = 1000; 
const SIMILARITY_THRESHOLD = 0.2;
const MAX_CONTEXT_LENGTH = 30000; 


const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const chatHistory = document.getElementById('chatHistory');
const statusText = document.getElementById('statusText');
const statusLight = document.getElementById('statusLight');
const statusContainer = document.getElementById('statusContainer');
const preprocessingContainer = document.getElementById('preprocessingContainer');
const preprocessingText = document.getElementById('preprocessingText');
const preprocessingProgress = document.getElementById('preprocessingProgress');
const cacheStatus = document.getElementById('cacheStatus');
const documentList = document.getElementById('documentList');


let speechSynthesis = window.speechSynthesis;
let isSpeaking = false;

document.addEventListener('DOMContentLoaded', async () => {
    if (!initializeAPIKey()) return;
    
    const cachedEmbeddings = localStorage.getItem('documentEmbeddings');
    const cachedChunks = localStorage.getItem('documentChunks');
    
    if (cachedEmbeddings && cachedChunks) {
        documentEmbeddings = JSON.parse(cachedEmbeddings);
        documentChunks = JSON.parse(cachedChunks);
        updateStatus('Ready', 'active');
        cacheStatus.style.display = 'inline-block';
        showDocumentList(documentChunks);
    } else {
        await preprocessDocuments();
    }
    
    sendButton.addEventListener('click', handleSend);
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });
});

async function preprocessDocuments() {
    preprocessingContainer.style.display = 'flex';
    documentList.style.display = 'block';
    updateStatus('Preprocessing...', 'processing');
    
    try {
        const files = await getAvailableFiles();
        let allText = '';
        let processedFiles = [];
        
        documentList.innerHTML = '';
        files.forEach(file => {
            const li = document.createElement('li');
            li.className = 'document-item';
            li.innerHTML = `
                <div class="document-status pending"></div>
                <span>${file}</span>
            `;
            documentList.appendChild(li);
            processedFiles.push({ element: li, name: file });
        });

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            preprocessingText.textContent = `Processing ${file}...`;
            preprocessingProgress.style.width = `${(i / files.length) * 100}%`;
            j
            try {
                let text = '';
                if (file.endsWith('.pdf')) {
                    text = await extractPDFText(`documents/${file}`);
                    if (text) allText += text + '\n\n';
                } else if (file.endsWith('.txt') || file.endsWith('.md')) {
                    const response = await fetch(`documents/${file}`);
                    if (response.ok) {
                        text = await response.text();
                        allText += text + '\n\n';
                    }
                }
                const fileItem = processedFiles.find(f => f.name === file);
                if (fileItem) {
                    fileItem.element.querySelector('.document-status').className = 'document-status processed';
                }
            } catch (error) {
                console.error(`Error processing ${file}:`, error);
                const fileItem = processedFiles.find(f => f.name === file);
                if (fileItem) {
                    fileItem.element.querySelector('.document-status').className = 'document-status error';
                    fileItem.element.innerHTML += `<span style="color:#f44336;margin-left:10px;">Error</span>`;
                }
            }
        }
        
        preprocessingText.textContent = 'Generating embeddings...';
        const chunks = splitTextIntoChunks(allText, CHUNK_SIZE);
        documentEmbeddings = await generateEmbeddings(chunks);
        documentChunks = chunks;

        localStorage.setItem('documentEmbeddings', JSON.stringify(documentEmbeddings));
        localStorage.setItem('documentChunks', JSON.stringify(documentChunks));
        
        preprocessingProgress.style.width = '100%';
        preprocessingText.textContent = 'Processing complete';
        setTimeout(() => {
            preprocessingContainer.style.display = 'none';
        }, 1000);
        
        updateStatus('Ready', 'active');
        showDocumentList(documentChunks);
    } catch (error) {
        console.error('Preprocessing error:', error);
        updateStatus('Preprocessing Error', 'error');
        preprocessingText.textContent = 'Error processing documents';
        preprocessingContainer.style.backgroundColor = '#ffebee';
    }
}

function showDocumentList(chunks) {
    if (!chunks || chunks.length === 0) return;
    
    const uniqueSources = new Set();
    chunks.forEach(chunk => {
        const sourceMatch = chunk.match(/FILE: (.*?)\n/);
        if (sourceMatch) {
            uniqueSources.add(sourceMatch[1]);
        }
    });
    
    if (uniqueSources.size > 0) {
        documentList.innerHTML = '';
        uniqueSources.forEach(source => {
            const li = document.createElement('li');
            li.className = 'document-item';
            li.innerHTML = `
                <div class="document-status processed"></div>
                <span>${source}</span>
            `;
            documentList.appendChild(li);
        });
        documentList.style.display = 'block';
    }
}

function splitTextIntoChunks(text, chunkSize) {
    const chunks = [];
    const paragraphs = text.split('\n\n');
    
    for (const paragraph of paragraphs) {
        if (paragraph.length <= chunkSize) {
            chunks.push(paragraph);
        } else {
            for (let i = 0; i < paragraph.length; i += chunkSize) {
                chunks.push(paragraph.substring(i, i + chunkSize));
            }
        }
    }
    
    return chunks.filter(chunk => chunk.trim().length > 0);
}

async function generateEmbeddings(chunks) {
    updateStatus('Generating embeddings...', 'processing');
    preprocessingText.textContent = `Generating embeddings (0/${chunks.length})`;
    
    try {
        const embeddings = [];
            for (let i = 0; i < chunks.length; i += 10) {
            const batch = chunks.slice(i, i + 10);
            preprocessingText.textContent = `Generating embeddings (${i}/${chunks.length})`;
            preprocessingProgress.style.width = `${(i / chunks.length) * 100}%`;
            
            const response = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${configuration.apiKey}`
                },
                body: JSON.stringify({
                    input: batch,
                    model: "text-embedding-3-small"
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Embedding error: ${errorData.error?.message || response.statusText}`);
            }
            
            const data = await response.json();
            embeddings.push(...data.data.map(item => item.embedding));
        }
        
        return embeddings;
    } catch (error) {
        console.error('Embedding generation error:', error);
        throw error;
    }
}
/*
async function handleFindRelChunks(questionEmbedding, documentEmbeddings, documentChunks) {
    const similarities = [];

    for (let i = 0; i < documentEmbeddings.length; i++) {
        const similarity = cosineSimilarity(questionEmbedding, documentEmbeddings[i]);
        similarities.push({ index: i, similarity, text: documentChunks[i] });
    }
    //Sort by similarity (descending). Incase of tie, sorts by index
    similarities.sort((a,b) => b.similarity - a.similarity || a.index - b.index);
}
*/ 

async function handleSend() {
    const question = userInput.value.trim();
    if (!question) return;

    addMessage(question, 'user');
    userInput.value = '';
    updateStatus('Processing...', 'processing');

    try {
        const questionEmbedding = await generateEmbeddings([question]);
        
        const relevantChunks = findMostRelevantChunks(questionEmbedding[0], documentEmbeddings, documentChunks);
        
        if (relevantChunks.length === 0) {
            addMessage("I couldn't find relevant information to answer your question.", 'bot');
            updateStatus('Ready', 'active');
            return;
        }
        let context = '';
        for (const chunk of relevantChunks) {
            if (context.length + chunk.text.length > MAX_CONTEXT_LENGTH) break;
            context += chunk.text + '\n\n';
        }
        const contextIndicator = document.createElement('div');
        contextIndicator.className = 'embedding-vis';
        contextIndicator.title = `Using ${relevantChunks.length} relevant context chunks`;
        chatHistory.appendChild(contextIndicator);
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${configuration.apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{
                    role: "system",
                    content: `Answer the question based only on the following context. Be concise and accurate. If you don't know, say "I don't know."\n\nContext:\n${context}`
                }, {
                    role: "user",
                    content: question
                }],
                temperature: 0.3,
                max_tokens: 400
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API Error: ${errorData.error?.message || response.statusText}`);
        }
        
        const data = await response.json();
        const answer = data.choices[0].message.content;
        
        addMessage(answer, 'bot');
        speakResponse(answer);
        updateStatus('Ready', 'active');
        
    } catch (error) {
        console.error('Query error:', error);
        addMessage(`Error: ${error.message}`, 'bot');
        updateStatus('Error', 'error');
    }
}

function findMostRelevantChunks(questionEmbedding, documentEmbeddings, documentChunks) {
    const similarities = [];
    
    for (let i = 0; i < documentEmbeddings.length; i++) {
        const similarity = cosineSimilarity(questionEmbedding, documentEmbeddings[i]);
        console.log('Similarity scores:', similarities.map(s => s.similarity));
        similarities.push({ 
            index: i, 
            similarity, 
            text: documentChunks[i],
            vectorVis: similarity.toFixed(2)
            
        });
    }
    
    // Sort by similarity (descending)
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    // Return chunks above threshold
    return similarities.filter(item => item.similarity > SIMILARITY_THRESHOLD);
}

function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    return normA && normB ? dotProduct / (normA * normB) : 0;
}

function handleKeyPress(event){
    if (event.key === 'Enter' && !event.shiftkey)
    {
        event.preventDefault();
        handleSend();
    }
}

function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', `${sender}-message`);
    messageDiv.textContent = text;
    chatHistory.appendChild(messageDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function updateStatus(text, state) {
    statusText.textContent = text;
    statusLight.className = 'status-light';
    if (state === 'active') statusLight.classList.add('active');
    else if (state === 'error') statusLight.classList.add('error');
    else if (state === 'processing') statusLight.classList.add('processing');
}

function speakResponse(text) {
    if (isSpeaking) {
        speechSynthesis.cancel();
    }
    isSpeaking = true;
    updateStatus('Speaking', 'active');
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1.6;
    utterance.pitch = 1.4;
    utterance.onend = () => {
        isSpeaking = false;
        updateStatus('Ready', 'active');
    };
    
    speechSynthesis.speak(utterance);
}

async function getAvailableFiles() {
    try {
        const response = await fetch('documents/');
        if (!response.ok) return ['Test.txt', 'sample.pdf', 'Cross Attention Model.pdf', '2112.10752v2.pdf']; 
        
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        return Array.from(doc.querySelectorAll('a'))
            .map(a => a.href.split('/').pop())
            .filter(f => f.endsWith('.pdf') || f.endsWith('.txt') || f.endsWith('.md'));
    } catch (error) {
        console.error('Auto-discovery failed, using fallback files');
        return ['Test.txt', 'sample.pdf', 'Cross Attention Model.pdf', '2112.10752v2.pdf']; 
    }
}

async function extractPDFText(pdfUrl) {
    try {
        if (typeof pdfjsLib === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.min.js';
            document.head.appendChild(script);
            await new Promise(resolve => script.onload = resolve);
        }
        
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';
        
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        

        
        
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const textItems = textContent.items.map(item => item.str);
            fullText += textItems.join(' ') + '\n';
        }
        
        return fullText;
    } catch (error) {
        console.error('PDF extraction error:', error);
        return null;
    }
}

function initializeAPIKey() {
    const savedKey = localStorage.getItem('evoxifyOpenAIKey');
    if (savedKey) {
        configuration.apiKey = savedKey;
        document.getElementById('apiKeyModal').style.display = 'none';
        return true;
    }
    showKeyModal();
    return false;
}

function showKeyModal() {
    const modal = document.getElementById('apiKeyModal');
    modal.style.display = 'block';
    
    document.getElementById('saveApiKey').addEventListener('click', () => {
        const key = document.getElementById('apiKeyInput').value.trim();
        if (key && key.startsWith('sk-')) {
            configuration.apiKey = key;
            localStorage.setItem('evoxifyOpenAIKey', key);
            modal.style.display = 'none';
            location.reload();
        } else {
            alert('Please enter a valid OpenAI API key (starts with sk-)');
        }
    });
}