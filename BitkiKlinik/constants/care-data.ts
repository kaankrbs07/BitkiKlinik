/**
 * Statik bakım ipuçları — Dashboard'da gösterilen içerik.
 * Buradan güncellendiğinde tüm uygulamada yansır;
 * ileride API'den çekilmesi gerektiğinde buradan migration kolaylaşır.
 */
export interface CareTip {
  id: number;
  title: string;
  description: string;
  icon: string;
  color: string;
}

export const CARE_TIPS: CareTip[] = [
  {
    id: 1,
    title: 'Su Dengesi',
    description: 'Bitkilerinizi düzenli sulayın ancak aşırıya kaçmayın. Toprak nemini kontrol edin.',
    icon: 'water-outline',
    color: '#4FC3F7',
  },
  {
    id: 2,
    title: 'Güneş Işığı',
    description: 'Çoğu bitki günde 6-8 saat dolaylı güneş ışığına ihtiyaç duyar.',
    icon: 'sunny-outline',
    color: '#FFB74D',
  },
  {
    id: 3,
    title: 'Toprak Kalitesi',
    description: 'Bitkinize uygun drenajlı toprak kullanın. Her 2 yılda bir yenileyin.',
    icon: 'leaf-outline',
    color: '#81C784',
  },
  {
    id: 4,
    title: 'Hastalık Takibi',
    description: 'Yaprakları düzenli kontrol edin. Erken teşhis tedaviyi kolaylaştırır.',
    icon: 'shield-checkmark-outline',
    color: '#CE93D8',
  },
];
