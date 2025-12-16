import { fetchComments } from './lib/youtube';
import { categorizeComments } from './lib/classifier';
import * as dotenv from 'dotenv';

dotenv.config();

async function test() {
    const videoId = 'dQw4w9WgXcQ'; // Rick Roll
    console.log(`Fetching comments for video ID: ${videoId}...`);

    try {
        const comments = await fetchComments(videoId, 20);
        console.log(`Fetched ${comments.length} comments.`);

        const categorized = categorizeComments(comments);

        const questions = categorized.filter(c => c.category === 'question');
        const feedback = categorized.filter(c => c.category === 'feedback');
        const general = categorized.filter(c => c.category === 'general');

        console.log('--- Stats ---');
        console.log(`Total: ${categorized.length}`);
        console.log(`Questions: ${questions.length}`);
        console.log(`Feedback: ${feedback.length}`);
        console.log(`General: ${general.length}`);

        console.log('\n--- Sample Question ---');
        if (questions.length > 0) console.log(questions[0].textOriginal);

        console.log('\n--- Sample Feedback ---');
        if (feedback.length > 0) console.log(feedback[0].textOriginal);

    } catch (error) {
        console.error('Test failed:', error);
    }
}

test();
