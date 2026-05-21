using BitkiKlinik.API.Models;
using BitkiKlinik.API.Models.Enums;
using Microsoft.EntityFrameworkCore;

namespace BitkiKlinik.API.Data;

/// <summary>
/// Uygulama başlangıcında veritabanını başlatan seed verisi.
/// Tablolar boşsa çalışır, zaten dolu ise atlar (idempotent).
///
/// Kapsam: 87 dataset sınıfı → Disease + Treatment + DiseaseTreatment
/// ModelLabel değerleri train.py'nin ürettiği class_map.json ile birebir eşleşmelidir.
/// </summary>
public static class SeedData
{
    public static async Task InitialiseAsync(ApplicationDbContext db)
    {
        // ── 0. KULLANICI YETKİLENDİRME (Admin Yetkisi) ─────────────────────
        // Id'si 3 olan kullanıcıyı bul ve Admin yap
        var adminUser = await db.Users.FindAsync(3);
        if (adminUser != null && adminUser.Role != UserRole.Admin)
        {
            adminUser.Role = UserRole.Admin;
            await db.SaveChangesAsync();
        }

        // Zaten seed yapılmışsa çık
        if (await db.Diseases.AnyAsync()) return;

        // ── 1. TEDAVİLER (Treatments) ────────────────────────────────────────
        // Birden fazla hastalıkta ortak kullanılan tedaviler tek kez tanımlanır.
        // TreatmentType: Natural = 1, Chemical = 2

        var treatments = new List<Treatment>
        {
            // ── Genel Doğal Tedaviler ──────────────────────────────────────────
            new() { Id =  1, Type = TreatmentType.Natural,   Title = "Neem Yağı Spreyi",
                Instructions = "1 litre suya 5 ml neem yağı ve birkaç damla sıvı sabun karıştırın. Haftada 1-2 kez yaprak altlarına dahil tüm yüzeylere spreyleyin. Sabah erken veya akşam geç saatlerde uygulayın." },

            new() { Id =  2, Type = TreatmentType.Natural,   Title = "Kompost Çayı Spreyi",
                Instructions = "Olgunlaşmış kompostu bez torbaya koyup 24-48 saat boyunca 10 kat suya bekletin. Süzülmüş sıvıyı spreyleyin. İçeriğindeki yararlı mikro-organizmalar (Bacillus, Trichoderma) fungal patojenlerle rekabet eder. Haftada 1-2 kez uygulayın; doğrudan güneş ışığından önce veya sonra tercih edin." },

            new() { Id =  3, Type = TreatmentType.Natural,   Title = "Sarımsak-Biber Spreyi",
                Instructions = "4-5 diş sarımsağı ve 1 adet kırmızı biberi blenderda öğütün, 1 litre suya ekleyip bir gece bekletin. Süzün ve etkilenen yapraklara uygulayın. Haftada 2 kez tekrarlayın." },

            new() { Id =  4, Type = TreatmentType.Natural,   Title = "Kabartma Tozu Çözeltisi",
                Instructions = "1 litre suya 1 tatlı kaşığı kabartma tozu ve birkaç damla sıvı sabun ekleyin. Mantar hastalıklarına karşı 3-4 günde bir spreyleyin." },

            new() { Id =  5, Type = TreatmentType.Natural,   Title = "Hasta Yaprakların Temizlenmesi",
                Instructions = "Enfekte yaprak, dal ve meyveleri keskin ve steril bir makasla kesin. Kesilen parçaları bitkinin yanında bırakmayın; kompostlamak yerine çöpe atın veya yakın." },

            new() { Id =  6, Type = TreatmentType.Natural,   Title = "Yavaş Bırakmalı Organik Gübre",
                Instructions = "Solunmuş veya granül formdaki organik gübreyi (kompost, solucan gübresi) toprağa karıştırın. Ayda bir uygulayın; bitkinin bağışıklığını güçlendirir." },

            new() { Id =  7, Type = TreatmentType.Natural,   Title = "Sabun-Su Karışımı (Böcek Kontrolü)",
                Instructions = "1 litre suya 5 ml sıvı sabun ekleyin. Beyaz sinek, kırmızı örümcek gibi zararlıları doğrudan hedefleyerek spreyleyin. 3 günde bir tekrarlayın." },

            new() { Id =  8, Type = TreatmentType.Natural,   Title = "Kükürt Tozu Uygulaması",
                Instructions = "Pudra kükürdünü sabah erken saatlerde (çiğ kalktıktan hemen sonra) yapraklara patlayarak uygulayın. Kükürt, külleme ve pas hastalıklarına karşı etkilidir. Sıcak havalarda (30°C üzeri) uygulamaktan kaçının." },

            new() { Id =  9, Type = TreatmentType.Natural,   Title = "Trichoderma Biyofungisit",
                Instructions = "Trichoderma harzianum içeren biyofungisiti etikete göre suya karıştırın. Toprak yüzeyine sulama veya drench yöntemiyle uygulayın. 15 günde bir tekrarlayın." },

            new() { Id = 10, Type = TreatmentType.Natural,   Title = "Yağlı Sabun + Sarımsak Spreyi (Yaprak Kıvrılması)",
                Instructions = "5 diş sarımsağı blenderdan geçirip 500 ml suya ekleyin. 24 saat bekletin, süzün ve 3 ml sıvı sabun ekleyin. Yaprak altlarına özellikle dikkat ederek haftada 2 kez uygulayın." },

            new() { Id = 11, Type = TreatmentType.Natural,   Title = "Yabani Ot Kontrolü ve Havalandırma",
                Instructions = "Bitki dibindeki yabani otları temizleyin. Bitkiler arası mesafeyi artırarak hava sirkülasyonunu sağlayın. Bu uygulama hastalık vektörlerini ve nem birikimini azaltır." },

            new() { Id = 12, Type = TreatmentType.Natural,   Title = "Güneş Işığı ve Sulama Yönetimi",
                Instructions = "Bitkiyi yeterli güneş alan alana taşıyın veya gölgelendirmeyi azaltın. Sulamayı sabah yapın; yaprakların gece ıslak kalmaması mantar gelişimini önler. Toprağı yüzeyden sulayın, yaprak ıslanmasından kaçının." },

            new() { Id = 13, Type = TreatmentType.Natural,   Title = "Potasyum Bikarbonat Spreyi",
                Instructions = "1 litre suya 5 gr potasyum bikarbonat ve 2 ml sıvı sabun karıştırın. Külleme başlangıcında haftada iki kez yapraklara uygulayın." },

            // ── Genel Kimyasal Tedaviler ───────────────────────────────────────
            new() { Id = 14, Type = TreatmentType.Chemical,  Title = "Mankozeb Fungisit",
                Instructions = "Mankozeb (%75 WP) içeren fungisiti 2 gr/litre dozunda suya karıştırın. 7-14 günde bir profilaktik veya hastalık görülünce uygulayın. Hasat öncesi güvenli süreye dikkat edin." },

            new() { Id = 15, Type = TreatmentType.Chemical,  Title = "Klorotalonil Fungisit",
                Instructions = "Klorotalonil içeren fungisiti etikete göre hazırlayın. Erken dönem mantarsal enfeksiyonlara karşı 10-14 günde bir uygulayın. Hastalık basıncı yüksekse aralığı kısaltın." },

            new() { Id = 16, Type = TreatmentType.Chemical,  Title = "Bakır-Oksiklorür Fungisit",
                Instructions = "Bakır oksiklorür (%50 WP) 3 gr/litre oranında suya karıştırın. Bakteriyel ve mantarsal hastalıklara karşı 10-14 günde bir uygulayın. Çiçeklenme döneminde dikkatli kullanın." },

            new() { Id = 17, Type = TreatmentType.Chemical,  Title = "İmidakloprid İnsektisit",
                Instructions = "İmidakloprid (200 SL) içeren insektisiti 0.3 ml/litre oranında hazırlayın. Beyaz sinek, yaprak biti ve emici böceklere karşı 2 haftada bir uygulayın. Polinatörlerden uzak tutun." },

            new() { Id = 18, Type = TreatmentType.Chemical,  Title = "Abamektin Akarisit",
                Instructions = "Abamektin içeren akarisiti 1 ml/litre oranında suya karıştırın. Kırmızı örümcek mite populasyonu yoğun olduğunda yaprak altlarına yoğun biçimde uygulayın." },

            new() { Id = 19, Type = TreatmentType.Chemical,  Title = "Streptomisin Sülfat (Bakteriyel)",
                Instructions = "Streptomisin sülfat içeren bakterisiti 200 ppm olacak şekilde hazırlayın. Bakteriyel leke ve yanıklık hastalıklarında 5-7 günde bir uygulayın." },

            new() { Id = 20, Type = TreatmentType.Chemical,  Title = "Propikonazol Sistemik Fungisit",
                Instructions = "Propikonazol (%25 EC) 1 ml/litre oranında suya karıştırın. Pas ve yaprak yanıklığı gibi sistemik hastalıklarda 14 günde bir uygulayın; bitkiye içten işler." },

            new() { Id = 21, Type = TreatmentType.Chemical,  Title = "Karbendazim Fungisit",
                Instructions = "Karbendazim (%50 WP) 1 gr/litre oranında suya karıştırın. Geniş spektrumlu mantar kontrolü için 10-14 günde bir uygulayın. Aynı aktif maddeyle direnç oluşumunu önlemek için rotasyona dikkat edin." },

            new() { Id = 22, Type = TreatmentType.Chemical,  Title = "Tiram Fungisit (Tohum + Toprak)",
                Instructions = "Tiram içeren fungisiti 3 gr/litre dozunda hazırlayın. Toprağa uygulayarak toprak kökenli patojenlere karşı etki edin; özellikle fide döneminde kullanın." },

            new() { Id = 23, Type = TreatmentType.Chemical,  Title = "Metalaksil + Mankozeb Fungisit",
                Instructions = "Metalaksil-M + mankozeb kombinasyonunu etikete göre hazırlayın. Geç ve erken yanıklığa karşı özellikle nemli dönemlerde 7-10 günde bir uygulayın." },

            new() { Id = 24, Type = TreatmentType.Chemical,  Title = "Asefat İnsektisit (Tırtıl Kontrolü)",
                Instructions = "Asefat (%75 SP) 1.5 gr/litre dozunda suya karıştırın. Tırtıl, yaprak güvesi ve çiğneyici zararlılara karşı 10-14 günde bir sabah erken uygulayın." },

            new() { Id = 25, Type = TreatmentType.Chemical,  Title = "Spirotetramat Akarisit-İnsektisit",
                Instructions = "Spirotetramat içeren ilacı etikete göre hazırlayın. Emici böcekler ve akarlar için sistemik etki sağlar; 3 haftada bir uygulanabilir." },

            // ── Ek Doğal Tedaviler ────────────────────────────────────────────
            new() { Id = 26, Type = TreatmentType.Natural,   Title = "Bacillus thuringiensis (Bt) Biyopestisit",
                Instructions = "Bt kuruzo (var. kurstaki veya aizawai) içeren biyopestisiti etikete göre suya karıştırın. Tırtıl ve larvaların bağırsak sistemine özgü Cry proteinleri üretir; memelilere, kuşlara ve bal arılarına zararsızdır. Yaprak yeme başladığında sabah erken 5-7 günde bir uygulayın; UV ışığı aktif maddeyi bozar, akşam üstü tercih edilebilir." },

            new() { Id = 27, Type = TreatmentType.Natural,   Title = "Diyatomlu Toprak (Diatomaceous Earth)",
                Instructions = "Gıda kalitesinde diyatomlu toprağı (kieselgur) ince bir tabaka halinde yaprak yüzeylerine ve bitki tabanına uygulayın. Böceklerin dış iskeletini mekanik olarak zedeler ve kurumalarına yol açar; ıslanınca etkisi geçici azalır, kuruduktan sonra yeniden aktifleşir. 7-10 günde bir veya yağmurdan sonra tekrarlayın." },

            new() { Id = 28, Type = TreatmentType.Natural,   Title = "Pirethrin Spreyi",
                Instructions = "Krizantem çiçeğinden elde edilen pirethrin bazlı biyopestisiti etikete göre suya karıştırın. Beyaz sinek, yaprak biti, tırtıl ve diğer böceklere karşı hızlı nakavt etkisi sağlar; güneş ışığında hızla parçalanarak çevre yüküne yok denecek kadar az katkıda bulunur. Akşam üstü, pollinatör aktivitesi düşükken uygulayın." },

            new() { Id = 29, Type = TreatmentType.Natural,   Title = "Bordo Bulamacı",
                Instructions = "Göztaşı (bakır sülfat) ve sönmüş kireç eşit ağırlıkta suya karıştırılarak hazırlanır (1:1:100 oranı). Hazır Bordo bulamacı tozları da kullanılabilir. Mevsim başında ve hastalık baskısı yüksekken yaprak, dal ve gövdeye uygulayın. Organik tarımda onaylıdır; çiçeklenme döneminde dikkatli kullanın." },

            // ── Ek Kimyasal Tedaviler ─────────────────────────────────────────
            new() { Id = 30, Type = TreatmentType.Chemical,  Title = "Azoksistrobin Fungisit (Strobilurin)",
                Instructions = "Azoksistrobin (%25 SC) içeren fungisiti 1 ml/litre dozunda suya karıştırın. Pirinç yanıklığı, buğday septoria/pası ve geniş spektrumlu mantarsal hastalıklara karşı 14 günde bir uygulayın. Direnç yönetimi için farklı etki mekanizmalı fungisitlerle rotasyona dikkat edin." },

            new() { Id = 31, Type = TreatmentType.Natural,   Title = "Kireç-Kükürt Karışımı (Calcium Polysulfide)",
                Instructions = "Kalsiyum polisülfür içeren hazır solüsyonu uyku döneminde (yaprak dökümünden sonra, tomurcuk kabarmasından önce) 3-5 litre/100 litre oranında suya karıştırın. Ağaç kabuğundaki kışlayan mantar sporlarını, yumurtaları ve akarları yok eder. Vejetasyon döneminde kullanmaktan kaçının." },
        };

        // ── 3. KAYDETME (Saving with Identity) ──────────────────────────────
        // Explicit ID kullandığımız için IDENTITY_INSERT açılması gerekir.
        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            using var transaction = await db.Database.BeginTransactionAsync();
            try
            {
                // Treatments
                await db.Database.ExecuteSqlRawAsync("SET IDENTITY_INSERT Treatments ON");
                await db.Treatments.AddRangeAsync(treatments);
                await db.SaveChangesAsync();
                await db.Database.ExecuteSqlRawAsync("SET IDENTITY_INSERT Treatments OFF");

        // ── 2. HASTALIKLAR VE TEDAVİ BAĞLANTILARI ────────────────────────────
        // ModelLabel: dataset klasör ismiyle birebir eşleşmeli (train.py → class_map.json)
        // TreatmentId referansları yukarıdaki Id değerleriyle eşleşmeli

        var diseases = new List<(Disease Disease, int[] TreatmentIds)>
        {
            // ── ELMA ──────────────────────────────────────────────────────────
            (new Disease { Id =  1, ModelLabel = "Apple__black_rot",
                Name = "Elma Siyah Çürüklüğü", Description = "Botryosphaeria obtusa mantarının neden olduğu; meyve, yaprak ve dallarda koyu siyah-kahverengi lekeler ve çürüme oluşturur." },
                new[] { 5, 2, 29, 31, 14, 15 }),

            (new Disease { Id =  2, ModelLabel = "Apple__rust",
                Name = "Elma Pası", Description = "Gymnosporangium juniperi-virginianae mantarından kaynaklanan pas hastalığı; yapraklarda turuncu yıldız şeklinde lekeler ve spor kümeleri görülür." },
                new[] { 5, 8, 31, 20, 14 }),

            (new Disease { Id =  3, ModelLabel = "Apple__scab",
                Name = "Elma Karalekesi (Scab)", Description = "Venturia inaequalis mantarından kaynaklanan hastalık; yaprak ve meyvelerde zeytin yeşili-siyah kadifemsi lekeler bırakır." },
                new[] { 2, 5, 29, 31, 14, 15 }),

            (new Disease { Id =  4, ModelLabel = "Apple__healthy",
                Name = "Elma (Sağlıklı)", Description = "Hastalık belirtisi görülmeyen sağlıklı elma bitkisi." },
                Array.Empty<int>()),

            // ── MANYOK (CASSAVA) ──────────────────────────────────────────────
            (new Disease { Id =  5, ModelLabel = "Cassava__bacterial_blight",
                Name = "Manyok Bakteriyel Yanıklığı", Description = "Xanthomonas axonopodis pv. manihotis bakterisinin yol açtığı; yapraklarda köşeli su ile ıslanmış lekeler, dal solması ve yaprak yanıklığı görülür." },
                new[] { 5, 16, 19, 11 }),

            (new Disease { Id =  6, ModelLabel = "Cassava__brown_streak_disease",
                Name = "Manyok Kahverengi Çizgi Hastalığı", Description = "CBSD virüsünün neden olduğu; yapraklarda sarımsı kahverengi çizgi ve lekeler, yumrularda iç kahverengi çürüme oluşur." },
                new[] { 5, 7, 17, 11 }),

            (new Disease { Id =  7, ModelLabel = "Cassava__green_mottle",
                Name = "Manyok Yeşil Benek Hastalığı", Description = "Virüs kaynaklı; yapraklarda düzensiz yeşil benek ve şişkinlik oluşarak bitki gelişimi bozulur." },
                new[] { 5, 7, 17 }),

            (new Disease { Id =  8, ModelLabel = "Cassava__mosaic_disease",
                Name = "Manyok Mozaik Hastalığı", Description = "CMD virüsünün neden olduğu; yapraklarda sarı-yeşil mozaik renk dağılımı, buruşma ve yaprak küçüklüğü belirtileri görülür." },
                new[] { 5, 7, 17, 6 }),

            (new Disease { Id =  9, ModelLabel = "Cassava__healthy",
                Name = "Manyok (Sağlıklı)", Description = "Hastalık belirtisi görülmeyen sağlıklı manyok bitkisi." },
                Array.Empty<int>()),

            // ── KİRAZ ─────────────────────────────────────────────────────────
            (new Disease { Id = 10, ModelLabel = "Cherry__powdery_mildew",
                Name = "Kiraz Külleme Hastalığı", Description = "Podosphaera clandestina mantarından kaynaklanan; yaprak yüzeyinde beyaz pudra görünümlü mantar örtüsü, yaprak kıvrılması ve meyvede büyüme geriliği." },
                new[] { 4, 8, 13, 21 }),

            (new Disease { Id = 11, ModelLabel = "Cherry__healthy",
                Name = "Kiraz (Sağlıklı)", Description = "Hastalık belirtisi görülmeyen sağlıklı kiraz bitkisi." },
                Array.Empty<int>()),

            // ── BİBER (CHİLİ) ────────────────────────────────────────────────
            (new Disease { Id = 12, ModelLabel = "Chili__leaf curl",
                Name = "Biber Yaprak Kıvrılması", Description = "Chili leaf curl virüsünün neden olduğu; yapraklarda yukarı yönde kıvrılma, sararma ve bitki bodurlaşması görülür; beyaz sinek ile taşınır." },
                new[] { 10, 7, 17, 5 }),

            (new Disease { Id = 13, ModelLabel = "Chili__leaf spot",
                Name = "Biber Yaprak Lekesi", Description = "Cercospora veya Alternaria mantarlarından kaynaklanan; yapraklarda kahverengi veya siyah kenarlıklı yuvarlak lekeler ve erken yaprak dökümü." },
                new[] { 2, 5, 14, 15 }),

            (new Disease { Id = 14, ModelLabel = "Chili__whitefly",
                Name = "Biber Beyaz Sinekle Enfestasyon", Description = "Bemisia tabaci'nin bitki özsuyunu emerek zayıflatması ve virüs taşıması; yaprak altlarında beyaz küçük sinekler ve yapışkan tatlı madde." },
                new[] { 7, 1, 27, 28, 17, 25 }),

            (new Disease { Id = 15, ModelLabel = "Chili__yellowish",
                Name = "Biber Sararması", Description = "Besin eksikliği, virüs veya aşırı/az sulama kaynaklı genel sararma; birden fazla nedeni olabilir." },
                new[] { 6, 12, 11 }),

            (new Disease { Id = 16, ModelLabel = "Chili__healthy",
                Name = "Biber (Sağlıklı)", Description = "Hastalık belirtisi görülmeyen sağlıklı biber bitkisi." },
                Array.Empty<int>()),

            // ── KAHVE ─────────────────────────────────────────────────────────
            (new Disease { Id = 17, ModelLabel = "Coffee__cercospora_leaf_spot",
                Name = "Kahve Cercospora Yaprak Lekesi", Description = "Cercospora coffeicola mantarından kaynaklanan; yapraklarda gümüşi-beyaz merkez ve kahverengi kenarlıklı yuvarlak lekeler." },
                new[] { 2, 5, 14, 9 }),

            (new Disease { Id = 18, ModelLabel = "Coffee__red_spider_mite",
                Name = "Kahve Kırmızı Örümcek Akarı", Description = "Oligonychus coffeae'nin yaprakları emerek bronzlaşmaya, sararma ve erken dökülmeye yol açması." },
                new[] { 1, 7, 18, 25 }),

            (new Disease { Id = 19, ModelLabel = "Coffee__rust",
                Name = "Kahve Pası", Description = "Hemileia vastatrix mantarından kaynaklanan; yaprakların alt yüzeyinde turuncu-sarı toz benzeri spor yığınları ve erken yaprak dökümü." },
                new[] { 8, 2, 20, 14 }),

            (new Disease { Id = 20, ModelLabel = "Coffee__healthy",
                Name = "Kahve (Sağlıklı)", Description = "Hastalık belirtisi görülmeyen sağlıklı kahve bitkisi." },
                Array.Empty<int>()),

            // ── MISIR ─────────────────────────────────────────────────────────
            (new Disease { Id = 21, ModelLabel = "Corn__common_rust",
                Name = "Mısır Ortak Pası", Description = "Puccinia sorghi mantarından kaynaklanan; yaprak yüzeyinde küçük, oval, kırmızımsı-kahverengi toz sporlar ve yaprak sarartması." },
                new[] { 8, 2, 20, 14 }),

            (new Disease { Id = 22, ModelLabel = "Corn__gray_leaf_spot",
                Name = "Mısır Gri Yaprak Lekesi", Description = "Cercospora zeae-maydis mantarından kaynaklanan; yapraklarda gri-kahverengi dikdörtgen lekeler ve premature olgunlaşma." },
                new[] { 2, 5, 14, 15 }),

            (new Disease { Id = 23, ModelLabel = "Corn__northern_leaf_blight",
                Name = "Mısır Kuzey Yaprak Yanıklığı", Description = "Exserohilum turcicum mantarından kaynaklanan; uzun elips şekilli gri-yeşil ya da soluk yeşil yaprak lekeleri; şiddetli verim kayıplarına yol açar." },
                new[] { 2, 5, 14, 23 }),

            (new Disease { Id = 24, ModelLabel = "Corn__healthy",
                Name = "Mısır (Sağlıklı)", Description = "Hastalık belirtisi görülmeyen sağlıklı mısır bitkisi." },
                Array.Empty<int>()),

            // ── SALATALIK ─────────────────────────────────────────────────────
            (new Disease { Id = 25, ModelLabel = "Cucumber__diseased",
                Name = "Salatalık Hastalıklı", Description = "Çeşitli mantar, bakteri veya virüs kaynaklı hastalıklar; külleme, downy küf, mozaik virüsü veya bakteriyel belirtiler görülebilir." },
                new[] { 4, 2, 14, 15 }),

            (new Disease { Id = 26, ModelLabel = "Cucumber__healthy",
                Name = "Salatalık (Sağlıklı)", Description = "Hastalık belirtisi görülmeyen sağlıklı salatalık bitkisi." },
                Array.Empty<int>()),

            // ── GUAVA ─────────────────────────────────────────────────────────
            (new Disease { Id = 27, ModelLabel = "Gauva__diseased",
                Name = "Guava Hastalıklı", Description = "Antraknoz, solgunluk veya yaprak lekesi gibi çeşitli hastalıklar; meyve ve yapraklarda kahverengi lekeler, çürüme görülebilir." },
                new[] { 2, 5, 14, 9 }),

            (new Disease { Id = 28, ModelLabel = "Gauva__healthy",
                Name = "Guava (Sağlıklı)", Description = "Hastalık belirtisi görülmeyen sağlıklı guava bitkisi." },
                Array.Empty<int>()),

            // ── ÜZÜM ──────────────────────────────────────────────────────────
            (new Disease { Id = 29, ModelLabel = "Grape__black_measles",
                Name = "Üzüm Siyah Kızamık (Esca)", Description = "Phaeomoniella ve Phaeoacremonium mantarlarından kaynaklanan; yapraklarda kaplan desenli sarı-kırmızı lekeler, gövdede iç kahverengi renk değişimi." },
                new[] { 5, 2, 15, 21 }),

            (new Disease { Id = 30, ModelLabel = "Grape__black_rot",
                Name = "Üzüm Siyah Çürüklüğü", Description = "Guignardia bidwellii mantarından kaynaklanan; yapraklarda kahverengi lekeler, tanelerde siyah büzülmüş çürüme." },
                new[] { 2, 5, 29, 14, 15 }),

            (new Disease { Id = 31, ModelLabel = "Grape__leaf_blight_(isariopsis_leaf_spot)",
                Name = "Üzüm Yaprak Yanıklığı (İzariopsis)", Description = "Pseudocercospora vitis mantarından kaynaklanan; yaprak yüzeyinde koyu kahverengi lekeler, alt yüzeyde gri tüylü spor oluşumu." },
                new[] { 5, 2, 29, 14, 21 }),

            (new Disease { Id = 32, ModelLabel = "Grape__healthy",
                Name = "Üzüm (Sağlıklı)", Description = "Hastalık belirtisi görülmeyen sağlıklı üzüm bitkisi." },
                Array.Empty<int>()),

            // ── JAMUN ─────────────────────────────────────────────────────────
            (new Disease { Id = 33, ModelLabel = "Jamun__diseased",
                Name = "Jamun Hastalıklı", Description = "Antraknoz veya yaprak lekesi yol açan mantar hastalıkları; meyve ve yapraklarda siyah-kahverengi lekeler görülür." },
                new[] { 2, 5, 14 }),

            (new Disease { Id = 34, ModelLabel = "Jamun__healthy",
                Name = "Jamun (Sağlıklı)", Description = "Hastalık belirtisi görülmeyen sağlıklı jamun bitkisi." },
                Array.Empty<int>()),

            // ── LİMON ─────────────────────────────────────────────────────────
            (new Disease { Id = 35, ModelLabel = "Lemon__diseased",
                Name = "Limon Hastalıklı", Description = "Citrus canker, alternaria leke veya turunçgil külleme gibi çeşitli hastalıklar; yaprak ve meyvede leke, sarımsılık ve mantarımsı örtü." },
                new[] { 2, 5, 16, 14 }),

            (new Disease { Id = 36, ModelLabel = "Lemon__healthy",
                Name = "Limon (Sağlıklı)", Description = "Hastalık belirtisi görülmeyen sağlıklı limon bitkisi." },
                Array.Empty<int>()),

            // ── MANGO ─────────────────────────────────────────────────────────
            (new Disease { Id = 37, ModelLabel = "Mango__diseased",
                Name = "Mango Hastalıklı", Description = "Antraknoz, külleme veya bakteri kaynaklı çeşitli hastalıklar; meyve ve yapraklarda kahverengi-siyah lekeler ve çürüme." },
                new[] { 2, 5, 14, 21 }),

            (new Disease { Id = 38, ModelLabel = "Mango__healthy",
                Name = "Mango (Sağlıklı)", Description = "Hastalık belirtisi görülmeyen sağlıklı mango bitkisi." },
                Array.Empty<int>()),

            // ── ŞEFTALİ ───────────────────────────────────────────────────────
            (new Disease { Id = 39, ModelLabel = "Peach__bacterial_spot",
                Name = "Şeftali Bakteriyel Lekesi", Description = "Xanthomonas arboricola pv. pruni'nin yol açtığı; yapraklarda köşeli kahverengi-siyah lekeler, meyvede sığ çatlaklar ve çürüme." },
                new[] { 5, 29, 31, 16, 19, 11 }),

            (new Disease { Id = 40, ModelLabel = "Peach__healthy",
                Name = "Şeftali (Sağlıklı)", Description = "Hastalık belirtisi görülmeyen sağlıklı şeftali bitkisi." },
                Array.Empty<int>()),

            // ── DOLMALIK BİBER ────────────────────────────────────────────────
            (new Disease { Id = 41, ModelLabel = "Pepper_bell__bacterial_spot",
                Name = "Dolmalık Biber Bakteriyel Lekesi", Description = "Xanthomonas campestris pv. vesicatoria'nın neden olduğu; yapraklarda sulu görünümlü koyu lekeler, meyvede sığ mantarımsı yaralar." },
                new[] { 5, 16, 19, 11 }),

            (new Disease { Id = 42, ModelLabel = "Pepper_bell__healthy",
                Name = "Dolmalık Biber (Sağlıklı)", Description = "Hastalık belirtisi görülmeyen sağlıklı dolmalık biber bitkisi." },
                Array.Empty<int>()),

            // ── NAR ───────────────────────────────────────────────────────────
            (new Disease { Id = 43, ModelLabel = "Pomegranate__diseased",
                Name = "Nar Hastalıklı", Description = "Antraknoz, alternaria çürümesi veya bakteri kaynaklı çeşitli hastalıklar; meyve ve yapraklarda kararma, lekelenme görülür." },
                new[] { 2, 5, 14, 9 }),

            (new Disease { Id = 44, ModelLabel = "Pomegranate__healthy",
                Name = "Nar (Sağlıklı)", Description = "Hastalık belirtisi görülmeyen sağlıklı nar bitkisi." },
                Array.Empty<int>()),

            // ── PATATES ───────────────────────────────────────────────────────
            (new Disease { Id = 45, ModelLabel = "Potato__early_blight",
                Name = "Patates Erken Yanıklığı", Description = "Alternaria solani mantarından kaynaklanan; yapraklarda koyu kahverengi hedef tahtası desenli halkalar; şiddetli salgınlarda tüm yaprak sarardığı ve döküldüğü görülür." },
                new[] { 2, 5, 14, 23 }),

            (new Disease { Id = 46, ModelLabel = "Potato__late_blight",
                Name = "Patates Geç Yanıklığı", Description = "Phytophthora infestans'ın neden olduğu; yapraklarda sulu görünümlü gri-yeşil lekeler, alt yüzeyde beyaz küf, yumrularda kahverengi çürüme; 1845 İrlanda Patatesi Kıtlığı'na yol açmıştır." },
                new[] { 5, 2, 23, 14 }),

            (new Disease { Id = 47, ModelLabel = "Potato__healthy",
                Name = "Patates (Sağlıklı)", Description = "Hastalık belirtisi görülmeyen sağlıklı patates bitkisi." },
                Array.Empty<int>()),

            // ── PİRİNÇ ────────────────────────────────────────────────────────
            (new Disease { Id = 48, ModelLabel = "Rice__brown_spot",
                Name = "Pirinç Kahverengi Lekesi", Description = "Cochliobolus miyabeanus mantarından kaynaklanan; yaprak, tahıl kavuzu ve gövdede oval kahverengi lekeler; yüksek nemde kitlesel verim kayıplarına neden olur." },
                new[] { 2, 14, 9, 6 }),

            (new Disease { Id = 49, ModelLabel = "Rice__hispa",
                Name = "Pirinç Hispa Böceği", Description = "Dicladispa armigera'nın yaprakları kazıyarak beslenmesi; yapraklarda beyaz çizgiler ve saydam tüneller; yoğun enfestasyonda yaprak kuruma." },
                new[] { 7, 1, 26, 27, 24, 17 }),

            (new Disease { Id = 50, ModelLabel = "Rice__leaf_blast",
                Name = "Pirinç Yaprak Yanıklığı", Description = "Magnaporthe oryzae'nin neden olduğu; yapraklarda gözbebeği şeklinde (beyaz merkez, kahverengi kenar) lekeler; en yıkıcı pirinç hastalıklarından biridir." },
                new[] { 2, 5, 9, 14, 20, 30 }),

            (new Disease { Id = 51, ModelLabel = "Rice__neck_blast",
                Name = "Pirinç Boyun Yanıklığı", Description = "Magnaporthe oryzae'nin başak sapına saldırması; başağın erken dökülmesi ve boş veya yarım dolu taneler; verimde büyük kayıp." },
                new[] { 5, 9, 14, 20, 30 }),

            (new Disease { Id = 52, ModelLabel = "Rice__healthy",
                Name = "Pirinç (Sağlıklı)", Description = "Hastalık belirtisi görülmeyen sağlıklı pirinç bitkisi." },
                Array.Empty<int>()),

            // ── SOYA ──────────────────────────────────────────────────────────
            (new Disease { Id = 53, ModelLabel = "Soybean__bacterial_blight",
                Name = "Soya Bakteriyel Yanıklığı", Description = "Pseudomonas savastanoi pv. glycinea'nın neden olduğu; yapraklarda köşeli sarımsı-kahverengi lekeler, soğuk ve yağışlı havalarda yayılım artar." },
                new[] { 5, 16, 19, 11 }),

            (new Disease { Id = 54, ModelLabel = "Soybean__caterpillar",
                Name = "Soya Tırtılı", Description = "Çeşitli yaprak yiyen tırtıl türleri; yapraklarda düzensiz delikler ve çiğneme izleri, yoğun salgında tamamen yaprak iskeletleşmesi." },
                new[] { 1, 7, 26, 28, 3, 24 }),

            (new Disease { Id = 55, ModelLabel = "Soybean__diabrotica_speciosa",
                Name = "Soya Diabrotica Böceği", Description = "Diabrotica speciosa erginlerinin yapraklara zarar vermesi; yapraklarda küçük yuvarlak delikler, larvaları ise köklerde beslenip bitki solmasına yol açar." },
                new[] { 1, 3, 26, 27, 24, 17 }),

            (new Disease { Id = 56, ModelLabel = "Soybean__downy_mildew",
                Name = "Soya Downy Küfü", Description = "Peronospora manshurica'nın neden olduğu; yaprak üst yüzeyinde soluk sarı lekeler, alt yüzeyde gri-beyaz tüylü sporlanma." },
                new[] { 2, 5, 23, 14 }),

            (new Disease { Id = 57, ModelLabel = "Soybean__mosaic_virus",
                Name = "Soya Mozaik Virüsü", Description = "SMV virüsünün yaprak bitleriyle taşınması; yapraklarda ışık-koyu yeşil mozaik desen, buruşma, yaprak küçüklüğü ve verim düşüklüğü." },
                new[] { 5, 7, 17, 6 }),

            (new Disease { Id = 58, ModelLabel = "Soybean__powdery_mildew",
                Name = "Soya Külleme Hastalığı", Description = "Erysiphe diffusa mantarından kaynaklanan; yaprak yüzeyinde beyaz pudra örtüsü; kuru ve sıcak koşullar hastalığı tetikler." },
                new[] { 4, 8, 13, 21 }),

            (new Disease { Id = 59, ModelLabel = "Soybean__rust",
                Name = "Soya Pası", Description = "Phakopsora pachyrhizi'nin neden olduğu; yaprak alt yüzeyinde sarı-kahverengi toz sporlar; hızlı yayılarak verimde %80'e kadar kayba yol açabilir." },
                new[] { 8, 20, 14, 2 }),

            (new Disease { Id = 60, ModelLabel = "Soybean__southern_blight",
                Name = "Soya Güney Yanıklığı", Description = "Athelia rolfsii mantarından kaynaklanan; bitki tabanında beyaz misel örtüsü ve hardal büyüklüğünde kahverengi sklerotlar; bitkinin aniden solup ölmesi." },
                new[] { 5, 9, 22, 14 }),

            (new Disease { Id = 61, ModelLabel = "Soybean__healthy",
                Name = "Soya (Sağlıklı)", Description = "Hastalık belirtisi görülmeyen sağlıklı soya bitkisi." },
                Array.Empty<int>()),

            // ── ÇİLEK ─────────────────────────────────────────────────────────
            (new Disease { Id = 62, ModelLabel = "Strawberry___leaf_scorch",
                Name = "Çilek Yaprak Yanıklığı", Description = "Diplocarpon earlianum mantarından kaynaklanan; yapraklarda kırmızımsı-mor noktalar, merkezleri gri-beyaza döner; şiddetli vakada yaprak tamamen kahverengi görünür." },
                new[] { 2, 5, 14, 15 }),

            (new Disease { Id = 63, ModelLabel = "Strawberry__healthy",
                Name = "Çilek (Sağlıklı)", Description = "Hastalık belirtisi görülmeyen sağlıklı çilek bitkisi." },
                Array.Empty<int>()),

            // ── ŞEKER KAMIŞI ──────────────────────────────────────────────────
            (new Disease { Id = 64, ModelLabel = "Sugarcane__bacterial_blight",
                Name = "Şeker Kamışı Bakteriyel Yanıklığı", Description = "Xanthomonas albilineans'ın neden olduğu; yapraklarda beyaz veya sarı çizgiler ve solgunluk; şiddetli vakalarda gövde içi renk değişimi." },
                new[] { 5, 16, 19, 11 }),

            (new Disease { Id = 65, ModelLabel = "Sugarcane__red_rot",
                Name = "Şeker Kamışı Kırmızı Çürüklüğü", Description = "Colletotrichum falcatum mantarından kaynaklanan; gövde iç kısmında kırmızı renk değişimi, boğumlar arası kırmızı-beyaz dönüşümlü renklenim; keskin alkol kokusu." },
                new[] { 5, 9, 14, 22 }),

            (new Disease { Id = 66, ModelLabel = "Sugarcane__red_stripe",
                Name = "Şeker Kamışı Kırmızı Şerit Hastalığı", Description = "Xanthomonas axonopodis pv. vasculorum'un neden olduğu bakteriyel hastalık; genç yapraklarda su ile ıslanmış kırmızı şeritler." },
                new[] { 5, 16, 19 }),

            (new Disease { Id = 67, ModelLabel = "Sugarcane__rust",
                Name = "Şeker Kamışı Pası", Description = "Puccinia melanocephala mantarından kaynaklanan; yapraklarda turuncu-kahverengi toz sporlar ve sarı haloluk." },
                new[] { 8, 20, 14, 2 }),

            (new Disease { Id = 68, ModelLabel = "Sugarcane__healthy",
                Name = "Şeker Kamışı (Sağlıklı)", Description = "Hastalık belirtisi görülmeyen sağlıklı şeker kamışı bitkisi." },
                Array.Empty<int>()),

            // ── ÇAY ───────────────────────────────────────────────────────────
            (new Disease { Id = 69, ModelLabel = "Tea__algal_leaf",
                Name = "Çay Alg Yaprağı Hastalığı", Description = "Cephaleuros virescens alg parazitinden kaynaklanan; yapraklarda yuvarlak, kadifemsi turuncu-kırmızı lekeler; dokunulduğunda toz bırakır." },
                new[] { 2, 5, 16, 11 }),

            (new Disease { Id = 70, ModelLabel = "Tea__anthracnose",
                Name = "Çay Antraknoz Hastalığı", Description = "Colletotrichum camelliae mantarından kaynaklanan; yapraklarda kahverengi-siyah düzensiz nekrotik lekeler; yüksek nem koşullarında yayılır." },
                new[] { 2, 5, 14, 21 }),

            (new Disease { Id = 71, ModelLabel = "Tea__bird_eye_spot",
                Name = "Çay Kuşgözü Lekesi", Description = "Cercospora theae mantarından kaynaklanan; yapraklarda küçük, kahverengi merkezli ve sarı halkalarla çevrili yuvarlak lekeler; kuş gözüne benzer görünüm." },
                new[] { 2, 5, 14 }),

            (new Disease { Id = 72, ModelLabel = "Tea__brown_blight",
                Name = "Çay Kahverengi Yanıklık", Description = "Colletotrichum gloeosporioides mantarından kaynaklanan; yaprak ucundan başlayan kahverengi yanıklık ve erken yaprak dökümü." },
                new[] { 2, 5, 14, 9 }),

            (new Disease { Id = 73, ModelLabel = "Tea__red_leaf_spot",
                Name = "Çay Kırmızı Yaprak Lekesi", Description = "Phoma theicola mantarından kaynaklanan; yapraklarda kırmızımsı-kahverengi büyük lekeler; nemli iklimde hızla yayılır." },
                new[] { 2, 5, 15, 14 }),

            (new Disease { Id = 74, ModelLabel = "Tea__healthy",
                Name = "Çay (Sağlıklı)", Description = "Hastalık belirtisi görülmeyen sağlıklı çay bitkisi." },
                Array.Empty<int>()),

            // ── DOMATES ───────────────────────────────────────────────────────
            (new Disease { Id = 75, ModelLabel = "Tomato__bacterial_spot",
                Name = "Domates Bakteriyel Lekesi", Description = "Xanthomonas campestris pv. vesicatoria'nın neden olduğu; yapraklarda su ile ıslanmış koyu lekeler, meyvede kabarık mantarımsı yaralar; yağışlı ve sıcak ortamda hızla yayılır." },
                new[] { 5, 16, 19, 11 }),

            (new Disease { Id = 76, ModelLabel = "Tomato__early_blight",
                Name = "Domates Erken Yanıklığı", Description = "Alternaria solani mantarından kaynaklanan; yaşlı yapraklarda hedef tahtası desenli kahverengi halkalar, sarı hale ile çevrelenmiş lekeler ve erken yaprak dökümü." },
                new[] { 2, 5, 14, 23 }),

            (new Disease { Id = 77, ModelLabel = "Tomato__late_blight",
                Name = "Domates Geç Yanıklığı", Description = "Phytophthora infestans'ın neden olduğu; yaprak ve gövdede gri-yeşil sulu lekeler, alt yüzeyde beyaz küf örtüsü; meyvede kahverengi sert çürüme." },
                new[] { 5, 2, 23, 14 }),

            (new Disease { Id = 78, ModelLabel = "Tomato__leaf_mold",
                Name = "Domates Yaprak Küfü", Description = "Passalora fulva mantarından kaynaklanan; yaprak üst yüzeyinde soluk sarı lekeler, alt yüzeyde kadifemsi zeytin yeşili-kahverengi küf; örtü altında yaygındır." },
                new[] { 4, 11, 12, 21 }),

            (new Disease { Id = 79, ModelLabel = "Tomato__mosaic_virus",
                Name = "Domates Mozaik Virüsü", Description = "TMV virüsünün neden olduğu; yapraklarda ışık-koyu yeşil veya sarı-yeşil mozaik renklenim, buruşma ve yaprak küçüklüğü; kontaminasyonla yayılır." },
                new[] { 5, 7, 11, 6 }),

            (new Disease { Id = 80, ModelLabel = "Tomato__septoria_leaf_spot",
                Name = "Domates Septoria Yaprak Lekesi", Description = "Septoria lycopersici mantarından kaynaklanan; yapraklarda çok sayıda küçük, su ile ıslanmış görünümlü gri merkezli ve koyu kahverengi kenarlıklı lekeler." },
                new[] { 2, 5, 14, 15 }),

            (new Disease { Id = 81, ModelLabel = "Tomato__spider_mites_(two_spotted_spider_mite)",
                Name = "Domates Kırmızı Örümcek Akarı", Description = "Tetranychus urticae'nin yaprak özsuyunu emerek bronzlaşma, sararma ve yaprakta ağ oluşturması; kuru ve sıcak koşullarda hızla çoğalır." },
                new[] { 1, 7, 18, 25 }),

            (new Disease { Id = 82, ModelLabel = "Tomato__target_spot",
                Name = "Domates Hedef Lekesi", Description = "Corynespora cassiicola mantarından kaynaklanan; yapraklarda hedef tahtası şeklinde iç içe geçmiş kahverengi halkalar ve sarı hale; meyve ve sapa da bulaşabilir." },
                new[] { 2, 5, 14, 9 }),

            (new Disease { Id = 83, ModelLabel = "Tomato__yellow_leaf_curl_virus",
                Name = "Domates Sarı Yaprak Kıvrılma Virüsü", Description = "TYLCV virüsünün beyaz sinek ile taşınması; yapraklarda sarımsı kıvrılma ve kaşık şekli alma, bitki bodurlaşması ve verimde dramatik düşüş." },
                new[] { 7, 17, 5, 25 }),

            (new Disease { Id = 84, ModelLabel = "Tomato__healthy",
                Name = "Domates (Sağlıklı)", Description = "Hastalık belirtisi görülmeyen sağlıklı domates bitkisi." },
                Array.Empty<int>()),

            // ── BUĞDAY ────────────────────────────────────────────────────────
            (new Disease { Id = 85, ModelLabel = "Wheat__brown_rust",
                Name = "Buğday Kahverengi Pası (Yaprak Pası)", Description = "Puccinia triticina mantarından kaynaklanan; yaprak yüzeyinde dağınık küçük, turuncu-kahverengi toz uredospor kümeleri; ılık ve nemli havalarda salgın yapar." },
                new[] { 8, 2, 20, 14, 30 }),

            (new Disease { Id = 86, ModelLabel = "Wheat__septoria",
                Name = "Buğday Septoria Yaprak Lekesi", Description = "Zymoseptoria tritici mantarından kaynaklanan; yapraklarda sarı-kahverengi uzun lekeler; ıslak havalarda hızla yayılarak verim kayıplarına yol açar." },
                new[] { 2, 5, 14, 15, 30 }),

            (new Disease { Id = 87, ModelLabel = "Wheat__yellow_rust",
                Name = "Buğday Sarı Pası (Şerit Pası)", Description = "Puccinia striiformis'in neden olduğu; yapraklarda damarlar boyunca sıralanmış sarı-turuncu toz sporlar; serin ve nemli koşullarda hızla yayılır." },
                new[] { 8, 2, 20, 14, 30 }),

            (new Disease { Id = 88, ModelLabel = "Wheat__healthy",
                Name = "Buğday (Sağlıklı)", Description = "Hastalık belirtisi görülmeyen sağlıklı buğday bitkisi." },
                Array.Empty<int>()),
        };

                // Diseases
                await db.Database.ExecuteSqlRawAsync("SET IDENTITY_INSERT Diseases ON");
                var diseaseEntities = diseases.Select(d => d.Disease).ToList();
                await db.Diseases.AddRangeAsync(diseaseEntities);
                await db.SaveChangesAsync();
                await db.Database.ExecuteSqlRawAsync("SET IDENTITY_INSERT Diseases OFF");

                // DiseaseTreatment bağlantılarını ekle (Identity her iki tarafta da kapalıyken ekle)
                var links = diseases
                    .SelectMany(d => d.TreatmentIds.Select(tid => new DiseaseTreatment
                    {
                        DiseaseId   = d.Disease.Id,
                        TreatmentId = tid
                    }))
                    .ToList();

                await db.DiseaseTreatments.AddRangeAsync(links);
                await db.SaveChangesAsync();

                await transaction.CommitAsync();
            }
            catch (Exception)
            {
                await transaction.RollbackAsync();
                throw;
            }
        });
    }
}
