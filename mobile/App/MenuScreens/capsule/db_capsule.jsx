import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Animated,
  StyleSheet,
  Easing,
  Pressable,
  Image,
  Alert,
  ActivityIndicator,
  Text,
} from 'react-native';

import { db } from '@/firebase/firebaseconfig';
import {
  collection,
  addDoc,
  doc,
  setDoc,
  increment,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { useNavigation } from '@react-navigation/native';

// ✅ Ambil dari server Glitch
import { getAIQuestionAnswer, checkAnswerWithAI } from '../../utils/ai';

import TopicInput from './components/TopicInput';
import DummyQuestion from './components/DummyQuestion';
import SubmitButton from './components/SubmitButton';

const CapsuleScreen = () => {
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const navigation = useNavigation();

  const [broken, setBroken] = useState(false);
  const [topic, setTopic] = useState('');
  const [dummyQA, setDummyQA] = useState(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('capsule'); // capsule | input | question | result

  // ─── Capsule animation
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 1, duration: 80, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -1, duration: 80, easing: Easing.linear, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const rotate = shakeAnim.interpolate({ inputRange: [-1, 1], outputRange: ['-4deg', '4deg'] });

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.2, duration: 150, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setBroken(true);
      setStep('input');
    });
  };

  // ─── Submit topik ke Firestore dan ambil pertanyaan AI
  const handleSubmitTopic = async () => {
    if (!topic.trim()) return Alert.alert('Error', 'Topik tidak boleh kosong.');
    const user = getAuth().currentUser;
    if (!user) return Alert.alert('Error', 'User belum login.');

    try {
      setLoading(true);
      const userId = user.uid;

      await addDoc(collection(db, 'users', userId, 'topics'), {
        topic,
        createdAt: new Date(),
      });

      const generated = await getAIQuestionAnswer(topic);

      console.log('📩 Soal dari AI:', generated.question);
      console.log('📩 Jawaban dari AI:', generated.answer);

      setDummyQA(generated);
      setStep('question');
      setTopic('');
      setResult(null);
    } catch (err) {
      console.error(err);
      Alert.alert('Error', err.message || 'Gagal memproses topik.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Evaluasi jawaban user dengan checkAnswerWithAI (tetap pakai OpenAI / lokal)
  const handleCheckAnswer = async () => {
    if (!dummyQA || !userAnswer.trim()) return Alert.alert('Error', 'Jawaban tidak boleh kosong.');

    try {
      setLoading(true);
      const verdict = await checkAnswerWithAI(dummyQA.question, dummyQA.answer, userAnswer);

      let score = 0;
      let message = 'Salah!';
      if (/benar/i.test(verdict)) {
        score = 10;
        message = 'Jawaban kamu benar!';
      } else if (/hampir/i.test(verdict)) {
        score = 8;
        message = 'Hampir benar!';
      }

      const user = getAuth().currentUser;
      if (user) {
        const userId = user.uid;
        await setDoc(
          doc(db, 'users', userId),
          { points: increment(score) },
          { merge: true }
        );

        const topicsRef = collection(db, 'users', userId, 'topics');
        const q = query(topicsRef, orderBy('createdAt', 'desc'), limit(1));
        const snapshot = await getDocs(q);
        snapshot.forEach(async (docSnap) => await deleteDoc(docSnap.ref));
      }

      setResult({ msg: message, correctAnswer: dummyQA.answer, score });
      setStep('result');
      setDummyQA(null);
      setUserAnswer('');
    } catch (error) {
      console.error('Gagal evaluasi jawaban:', error);
      Alert.alert('Error', 'Gagal mengevaluasi jawaban.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {step === 'capsule' && (
        <Pressable onPress={handlePress}>
          <Animated.Image
            source={require('../../../assets/images/pills.png')}
            style={[styles.capsule, { transform: [{ rotate }, { scale: scaleAnim }] }]}
            resizeMode="contain"
          />
        </Pressable>
      )}

      {broken && step !== 'capsule' && (
        <Image source={require('../../../assets/images/pecah.png')} style={styles.capsule} resizeMode="contain" />
      )}

      {step === 'input' && !loading && (
        <>
          <TopicInput topic={topic} setTopic={setTopic} />
          <SubmitButton onPress={handleSubmitTopic} />
        </>
      )}

      {loading && <ActivityIndicator size="large" color="#4CAF50" />}

      {step === 'question' && dummyQA && (
        <DummyQuestion
          question={dummyQA.question}
          myAns={userAnswer}
          setMyAns={setUserAnswer}
          onCheck={handleCheckAnswer}
        />
      )}

      {step === 'result' && result && (
        <View style={{ marginTop: 20, alignItems: 'center' }}>
          <Image source={require('../../../assets/images/studora.png')} style={{ width: 80, height: 80 }} />
          <Text style={{ fontSize: 16, fontWeight: 'bold', marginTop: 10 }}>{result.msg}</Text>
          <Text>Jawaban benar: {result.correctAnswer}</Text>
          <Text>Skor kamu: {result.score}</Text>
          <Pressable
            onPress={() => navigation.navigate('Dashboard')}
            style={{
              marginTop: 20,
              paddingVertical: 12,
              paddingHorizontal: 24,
              backgroundColor: '#2196F3',
              borderRadius: 10,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
              Kembali ke Dashboard
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 20,
  },
  capsule: {
    width: 220,
    height: 220,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
});

export default CapsuleScreen;
