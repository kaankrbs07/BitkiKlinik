import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
  Keyboard
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../hooks/useAppTheme';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { dotnetClient } from '../api/client';
import { API_ROUTES } from '../constants/api-routes';

// Premium Light & Dark Color Palettes
const LIGHT_COLORS = {
  emerald: '#10b981',
  slate: '#0f172a',
  slateLight: '#64748b',
  background: '#f8fafc',
  white: '#ffffff',
  bubbleUser: '#10b981',
  bubbleModel: '#f1f5f9',
  textUser: '#ffffff',
  textModel: '#1e293b',
  border: '#e2e8f0',
};

const DARK_COLORS = {
  emerald: '#10b981',
  slate: '#f8fafc',
  slateLight: '#94a3b8',
  background: '#0f172a',
  white: '#1e293b',
  bubbleUser: '#10b981',
  bubbleModel: '#334155',
  textUser: '#ffffff',
  textModel: '#f8fafc',
  border: '#334155',
};

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
}

// Markdown formatındaki (**kalın** ve *italik*) metinleri React Native Text bileşenlerine dönüştürür
const renderFormattedText = (text: string) => {
  if (!text) return null;
  
  const parts = text.split('**');
  return parts.map((part, i) => {
    const isBold = i % 2 === 1;
    
    if (isBold) {
      return (
        <Text key={i} style={{ fontWeight: 'bold' }}>
          {part}
        </Text>
      );
    }
    
    const italicParts = part.split('*');
    if (italicParts.length > 1) {
      return italicParts.map((subPart, j) => {
        const isItalic = j % 2 === 1;
        if (isItalic) {
          return (
            <Text key={`${i}-${j}`} style={{ fontStyle: 'italic' }}>
              {subPart}
            </Text>
          );
        }
        return subPart;
      });
    }
    
    return part;
  });
};

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { isDark } = useAppTheme();
  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;
  const styles = getStyles(colors);
  const params = useLocalSearchParams();
  const router = useRouter();
  const scanId = params.scanId as string | undefined;
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(params.sessionId as string | undefined);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Sohbet geçmişini veritabanından çek veya ilk karşılama mesajını ayarla
  useEffect(() => {
    const loadHistory = async () => {
      setIsLoading(true);
      try {
        const route = API_ROUTES.CHAT_HISTORY(currentSessionId, scanId);
        const response = await dotnetClient.get(route);
        const dbHistory = response.data; // List of { role, content }

        if (dbHistory && dbHistory.length > 0) {
          const loadedMessages: Message[] = dbHistory.map((msg: any, index: number) => ({
            id: `db-${index}-${Math.random()}`,
            role: msg.role as 'user' | 'model',
            content: msg.content,
            timestamp: new Date()
          }));
          setMessages(loadedMessages);
        } else {
          // Geçmiş yoksa ilk karşılama mesajını ayarla
          const greetingMsg: Message = {
            id: 'greeting',
            role: 'model',
            content: scanId 
              ? "Merhaba! Ben BitkiKlinik'in Yapay Zeka Hekimiyim. Gerçekleştirdiğiniz teşhis analizini inceledim. Bitkinizin durumu, önerilen doğal/kimyasal tedavi adımları veya genel bakım ipuçları hakkında sormak istediğiniz her şeyi bana iletebilirsiniz. Size nasıl yardımcı olabilirim? 🌿"
              : "Merhaba! Ben Yapay Zeka Ziraat Mühendisiyim. Genel bitki bakımı, sulama, gübreleme, saksı değişimi veya bitki hastalıkları hakkında aklınıza takılan her şeyi bana sorabilirsiniz. 🌿 \n\n*Not: Eğer bitkinizde bir hastalık şüphesi varsa, AI Sağlık Taraması özelliğimizi kullanarak fotoğraf yükleyip anında kesin teşhis de alabilirsiniz.*",
            timestamp: new Date()
          };
          setMessages([greetingMsg]);
        }
      } catch (error) {
        console.error("Sohbet geçmişi yüklenirken hata oluştu:", error);
        const greetingMsg: Message = {
          id: 'greeting',
          role: 'model',
          content: "Sohbet geçmişiniz yüklenemedi ancak sıfırdan başlayabilirsiniz. Merhaba! Ben Yapay Zeka Ziraat Mühendisiyim, size nasıl yardımcı olabilirim? 🌿",
          timestamp: new Date()
        };
        setMessages([greetingMsg]);
      } finally {
        setIsLoading(false);
        scrollToBottom();
      }
    };

    loadHistory();
  }, [currentSessionId, scanId]);

  // Yeni mesaj geldiğinde en alta kaydır
  const scrollToBottom = () => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleSend = async () => {
    if (inputText.trim() === '' || isLoading) return;

    const userMessage: Message = {
      id: Math.random().toString(),
      role: 'user',
      content: inputText.trim(),
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);
    Keyboard.dismiss();
    scrollToBottom();

    try {
      const payload = {
        scanId: scanId ? parseInt(scanId, 10) : null,
        sessionId: currentSessionId || null,
        history: [
          {
            role: 'user',
            content: userMessage.content
          }
        ]
      };

      const response = await dotnetClient.post(API_ROUTES.CHAT, payload);
      
      const aiReply = response.data.reply;
      const returnedSessionId = response.data.sessionId;

      if (returnedSessionId && returnedSessionId !== currentSessionId) {
        setCurrentSessionId(returnedSessionId);
        router.setParams({ sessionId: returnedSessionId });
      }

      const aiMessage: Message = {
        id: Math.random().toString(),
        role: 'model',
        content: aiReply,
        timestamp: new Date()
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error: any) {
      console.error('Chat error:', error);
      
      const errorMessage: Message = {
        id: Math.random().toString(),
        role: 'model',
        content: "Üzgünüm, şu anda yanıt alamıyorum. Yapay zeka servisimiz geçici olarak meşgul olabilir veya internet bağlantınızda sorun yaşanıyor olabilir. Lütfen biraz sonra tekrar deneyin. ⚠️",
        timestamp: new Date()
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      scrollToBottom();
    }
  };

  const renderMessageItem = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageRow, isUser ? styles.rowUser : styles.rowModel]}>
        {!isUser && (
          <View style={styles.avatarContainer}>
            <Ionicons name="leaf" size={16} color={colors.white} />
          </View>
        )}
        <View style={[
          styles.bubble, 
          isUser ? styles.bubbleUser : styles.bubbleModel,
          !isUser && styles.bubbleModelBorder
        ]}>
          <Text style={[styles.messageText, isUser ? styles.textUser : styles.textModel]}>
            {renderFormattedText(item.content)}
          </Text>
          <Text style={[styles.timeText, isUser ? styles.timeUser : styles.timeModel]}>
            {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.slate} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Yapay Zeka Hekimi</Text>
          <Text style={styles.headerSubtitle}>
            {scanId ? "Teşhis & Tedavi Asistanı" : "Botanisyen & Ziraat Mühendisi"}
          </Text>
        </View>
        <View style={[styles.statusIndicator, isDark && { backgroundColor: '#064e3b' }]}>
          <View style={styles.greenDot} />
          <Text style={[styles.statusText, isDark && { color: '#10b981' }]}>Aktif</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom : 0}
      >
        {/* Mesaj Listesi */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessageItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToBottom}
        />

        {/* Yükleniyor Göstergesi */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <View style={styles.loadingBubble}>
              <ActivityIndicator size="small" color={colors.emerald} />
              <Text style={styles.loadingText}>Yapay Zeka Hekimi yazıyor...</Text>
            </View>
          </View>
        )}

        {/* Input Bar */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Sorunuzu yazın..."
            placeholderTextColor={colors.slateLight}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity 
            style={[styles.sendButton, inputText.trim() === '' && styles.sendButtonDisabled]} 
            onPress={handleSend}
            disabled={inputText.trim() === '' || isLoading}
          >
            <Ionicons name="send" size={18} color={colors.white} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (colors: typeof LIGHT_COLORS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 3,
  },
  backButton: {
    padding: 6,
    marginRight: 10,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.slate,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.slateLight,
    marginTop: 2,
    fontWeight: '500',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
    marginRight: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803d',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 16,
    maxWidth: '85%',
  },
  rowUser: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },
  rowModel: {
    alignSelf: 'flex-start',
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.emerald,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    alignSelf: 'flex-end',
  },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleUser: {
    backgroundColor: colors.bubbleUser,
    borderBottomRightRadius: 4,
  },
  bubbleModel: {
    backgroundColor: colors.bubbleModel,
    borderBottomLeftRadius: 4,
  },
  bubbleModelBorder: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  textUser: {
    color: colors.textUser,
  },
  textModel: {
    color: colors.textModel,
  },
  timeText: {
    fontSize: 9,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  timeUser: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  timeModel: {
    color: colors.slateLight,
  },
  loadingContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadingText: {
    fontSize: 13,
    color: colors.slateLight,
    marginLeft: 8,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 10,
    maxHeight: 100,
    fontSize: 15,
    color: colors.slate,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.emerald,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#cbd5e1',
  },
});
