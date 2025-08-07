let topics = [];

function loadTopics() {
  chrome.storage.local.get(['topics'], (data) => {
    topics = data.topics || [];
    renderTopics();
    updateStats();
  });
}

function saveTopics() {
  chrome.storage.local.set({ topics });
}

function renderTopics() {
  const container = document.getElementById('topics');
  container.innerHTML = '';
  if (topics.length === 0) {
    container.innerHTML = '<div class="empty-state">No topics added yet. Start by entering one above.</div>';
    return;
  }
  topics.forEach((topic, index) => {
    const card = document.createElement('div');
    card.className = 'topic-card';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'topic-name';
    nameSpan.textContent = topic;
    card.appendChild(nameSpan);
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove';
    removeBtn.innerHTML = '&times;';
    removeBtn.onclick = () => {
      topics.splice(index, 1);
      saveTopics();
      renderTopics();
      updateStats();
    };
    card.appendChild(removeBtn);
    
    container.appendChild(card);
  });
}

function updateStats() {
  const stats = document.getElementById('stats');
  stats.textContent = `${topics.length} Topics`;
}

function addTopic() {
  const input = document.getElementById('topicInput');
  const topic = input.value.trim();
  if (!topic || topics.includes(topic)) {
    input.value = '';
    return;
  }
  topics.push(topic);
  saveTopics();
  renderTopics();
  updateStats();
  input.value = '';
}

document.addEventListener('DOMContentLoaded', () => {
  loadTopics();
  document.getElementById('addBtn').addEventListener('click', addTopic);
  document.getElementById('topicInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTopic();
  });
});
