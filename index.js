const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());

// Initialize Supabase Admin (Used to lookup push_tokens)
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Firebase Admin
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    // Fix for common PEM formatting issues when pasting into Render env variables
    if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase Admin initialized successfully');
} catch (error) {
    console.error('Firebase initialization error:', error.message);
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Health Check for UptimeRobot and Render
app.get('/', (req, res) => {
    res.send('NearCart Notification Server is Live and Healthy! 🚀');
});

app.post('/send-notification', async (req, res) => {
    try {
        const { userId, title, message, orderId, type } = req.body;
        
        if (!userId) {
            return res.status(400).send('Missing userId');
        }

        console.log(`Processing notification for user: ${userId}, Title: ${title}`);

        // 1. Fetch push_token dynamically from Supabase
        let { data: profile } = await supabase.from('profiles').select('push_token').eq('id', userId).maybeSingle();
        let pushToken = profile?.push_token;

        if (!pushToken) {
            let { data: staff } = await supabase.from('shop_staff').select('push_token').eq('id', userId).maybeSingle();
            pushToken = staff?.push_token;
        }

        if (!pushToken) {
            return res.status(200).send('No push token found for this user');
        }

        if (pushToken.startsWith('ExponentPushToken')) {
            // EXPO PUSH
            const response = await axios.post(EXPO_PUSH_URL, {
                to: pushToken,
                sound: 'default',
                title: record.title || 'NearCart',
                body: record.message || 'New Update',
                data: { order_id: record.order_id, type: record.type },
                priority: 'high'
            });
            console.log('Expo Response:', response.data);
            return res.json(response.data);
        } else {
            // NATIVE FCM V1 (High Priority Banner)
            const message = {
                token: pushToken,
                notification: {
                    title: record.title || 'NearCart Alert',
                    title: title || 'NearCart Alert',
                    body: message || 'You have a new update',
                },
                data: {
                    order_id: String(orderId || ''),
                    type: String(type || ''),
                },
                android: {
                    priority: "high",
                    notification: {
                        channelId: "order_alerts_v2", // Matches your app's channel
                        sound: "default",
                        tag: String(orderId),
                        visibility: "public",
                        notificationPriority: "PRIORITY_MAX",
                    }
                }
            };

            const response = await admin.messaging().send(message);
            console.log('FCM Success:', response);
            return res.json({ success: true, messageId: response });
        }

    } catch (error) {
        console.error('Error sending notification:', error.message);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Notification server running on port ${PORT}`);
});
