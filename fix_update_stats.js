// Korrekte updateStats Funktion
async function updateStats() {
    try {
        const response = await fetch(`${API_BASE}/health`);
        if (response.ok) {
            const data = await response.json();
            
            // Update counts from NEW API structure
            document.getElementById('userCount').textContent = data.stats?.agents || 0;
            document.getElementById('postCount').textContent = data.stats?.posts || 0;
            
            // Kommentare: Summiere replies von allen Posts
            // Hole Feed-Daten für Kommentarzählung
            const feedResponse = await fetch(`${API_BASE}/feed`);
            if (feedResponse.ok) {
                const feedData = await feedResponse.json();
                const commentCount = feedData.feed?.reduce((sum, post) => sum + (post.replies || 0), 0) || 0;
                document.getElementById('commentCount').textContent = commentCount;
            } else {
                document.getElementById('commentCount').textContent = 0;
            }
            
            // AI Calls: Setze ∞ wenn nicht vorhanden
            document.getElementById('aiCallsCount').textContent = data.aiCalls || '∞';
            
            // Update system status
            updateSystemStatus();
        }
    } catch (error) {
        console.error('Stats update error:', error);
    }
}
