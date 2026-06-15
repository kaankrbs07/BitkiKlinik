using Microsoft.EntityFrameworkCore;
using BitkiKlinik.API.Models;
using BitkiKlinik.API.Models.Enums;

namespace BitkiKlinik.API.Data;

public class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options) { }

    public DbSet<Users> Users { get; set; } = null!;
    public DbSet<Disease> Diseases { get; set; } = null!;
    public DbSet<Treatment> Treatments { get; set; } = null!;
    public DbSet<DiseaseTreatment> DiseaseTreatments { get; set; } = null!;
    public DbSet<PlantScan> PlantScans { get; set; } = null!;
    public DbSet<ActiveLearningQueue> ActiveLearningQueue { get; set; } = null!;
    public DbSet<ChatMessage> ChatMessages { get; set; } = null!;
    public DbSet<DiseaseRiskAlert> DiseaseRiskAlerts { get; set; } = null!;
    public DbSet<AuditLog> AuditLogs { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // ── Table name mappings ──────────────────────────────────────────────
        modelBuilder.Entity<Users>().ToTable("Users");
        modelBuilder.Entity<Disease>().ToTable("Diseases");
        modelBuilder.Entity<Treatment>().ToTable("Treatments");
        modelBuilder.Entity<DiseaseTreatment>().ToTable("DiseaseTreatments");
        modelBuilder.Entity<PlantScan>().ToTable("PlantScans");
        modelBuilder.Entity<ActiveLearningQueue>().ToTable("ActiveLearningQueue");
        modelBuilder.Entity<DiseaseRiskAlert>().ToTable("DiseaseRiskAlerts");

        // ── AuditLog configuration ───────────────────────────────────────────
        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.ToTable("AuditLogs");
            entity.HasKey(a => a.Id);

            entity.Property(a => a.UserId)
                  .IsRequired()
                  .HasMaxLength(50);

            entity.Property(a => a.TableName)
                  .IsRequired()
                  .HasMaxLength(100);

            entity.Property(a => a.EntityId)
                  .IsRequired()
                  .HasMaxLength(200);

            entity.Property(a => a.Action)
                  .HasConversion<int>()
                  .IsRequired();

            // Admin paneli filtreleme sorgularını hızlandırmak için index'ler
            entity.HasIndex(a => a.Timestamp);          // Tarih filtresi
            entity.HasIndex(a => a.UserId);             // Kullanıcı filtresi
            entity.HasIndex(a => a.TableName);          // Tablo filtresi
            entity.HasIndex(a => a.Action);             // İşlem türü filtresi
        });

        // ── Treatment: store TreatmentType enum as an integer column ─────────
        modelBuilder.Entity<Treatment>(entity =>
        {
            entity.HasKey(t => t.Id);

            entity.Property(t => t.Type)
                  .HasConversion<int>()          // Natural=1, Chemical=2 stored as int
                  .IsRequired();

            entity.Property(t => t.Title)
                  .IsRequired()
                  .HasMaxLength(200);

            entity.Property(t => t.Instructions)
                  .IsRequired();
        });

        // ── DiseaseTreatment: composite primary key + FK configuration ────────
        modelBuilder.Entity<DiseaseTreatment>(entity =>
        {
            // Composite PK using both foreign keys
            entity.HasKey(dt => new { dt.DiseaseId, dt.TreatmentId });

            // Disease side: one Disease → many DiseaseTreatments
            entity.HasOne(dt => dt.Disease)
                  .WithMany(d => d.DiseaseTreatments)
                  .HasForeignKey(dt => dt.DiseaseId)
                  .OnDelete(DeleteBehavior.Cascade);

            // Treatment side: one Treatment → many DiseaseTreatments
            entity.HasOne(dt => dt.Treatment)
                  .WithMany(t => t.DiseaseTreatments)
                  .HasForeignKey(dt => dt.TreatmentId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // ── PlantScan: FK + enum + index configuration ──────────────────────
        modelBuilder.Entity<PlantScan>(entity =>
        {
            entity.HasKey(ps => ps.Id);

            // FK → Users tablosu
            entity.HasOne(ps => ps.User)
                  .WithMany(u => u.PlantScans)
                  .HasForeignKey(ps => ps.UserId)
                  .OnDelete(DeleteBehavior.Cascade);

            // ScanStatus enum'ını int olarak sakla
            entity.Property(ps => ps.Status)
                  .HasConversion<int>()
                  .IsRequired();

            entity.Property(ps => ps.PlantName)
                  .IsRequired()
                  .HasMaxLength(200);

            entity.Property(ps => ps.DiseaseName)
                  .IsRequired()
                  .HasMaxLength(200);

            // Dashboard sorgusu için bileşik index (UserId + ScanDate DESC)
            entity.HasIndex(ps => new { ps.UserId, ps.ScanDate });
        });

        // ── ActiveLearningQueue configuration ───────────────────────────────
        modelBuilder.Entity<ActiveLearningQueue>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Status).HasConversion<int>();
            entity.Property(e => e.Source).HasConversion<int>();
            entity.Property(e => e.PredictedDisease).IsRequired().HasMaxLength(200);
            entity.Property(e => e.CorrectedDisease).HasMaxLength(200);
            entity.Property(e => e.ImagePath).IsRequired().HasMaxLength(500);
            entity.HasOne(e => e.Scan)
                  .WithMany()
                  .HasForeignKey(e => e.ScanId)
                  .OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.CreatedAt);
        });

        // ── ChatMessage configuration ─────────────────────────────────────────
        modelBuilder.Entity<ChatMessage>(entity =>
        {
            entity.ToTable("ChatMessages");
            entity.HasKey(c => c.Id);
            entity.Property(c => c.Role).IsRequired().HasMaxLength(50);
            entity.Property(c => c.Content).IsRequired();
            entity.Property(c => c.SessionId).IsRequired().HasMaxLength(100).HasDefaultValue("");
            entity.Property(c => c.IsActive).HasDefaultValue(true);
            
            entity.HasOne(c => c.User)
                  .WithMany()
                  .HasForeignKey(c => c.UserId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(c => c.Scan)
                  .WithMany()
                  .HasForeignKey(c => c.ScanId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasQueryFilter(c => c.IsActive);
        });

        // ── DiseaseRiskAlert configuration ───────────────────────────────────
        modelBuilder.Entity<DiseaseRiskAlert>(entity =>
        {
            entity.HasKey(dra => dra.Id);
            entity.Property(dra => dra.DiseaseName).IsRequired().HasMaxLength(200);
            entity.Property(dra => dra.RiskLevel).IsRequired().HasMaxLength(50);
            entity.Property(dra => dra.Suggestion).IsRequired().HasMaxLength(1000);

            entity.HasOne(dra => dra.User)
                  .WithMany()
                  .HasForeignKey(dra => dra.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
