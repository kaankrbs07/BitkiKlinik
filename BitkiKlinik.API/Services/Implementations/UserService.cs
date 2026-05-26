using BitkiKlinik.API.Data;
using BitkiKlinik.API.Models;
using BitkiKlinik.API.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace BitkiKlinik.API.Services.Implementations;

public class UserService : GenericService<Users>, IUserService
{
    private readonly ApplicationDbContext _context;
    private readonly IPasswordHasher _passwordHasher;

    public UserService(ApplicationDbContext context, IPasswordHasher passwordHasher) : base(context)
    {
        _context        = context;
        _passwordHasher = passwordHasher;
    }

    public async Task<Users?> GetByUsernameAsync(string username)
    {
        return await _context.Set<Users>().FirstOrDefaultAsync(u => u.Username == username && u.IsActive);
    }

    public async Task<Users?> GetByEmailAsync(string email)
    {
        return await _context.Set<Users>().FirstOrDefaultAsync(u => u.Email == email && u.IsActive);
    }

    /// <summary>
    /// Token değerini ve son kullanma tarihini tek sorguda doğrular.
    /// Pasif kullanıcılar dahil edilmez.
    /// </summary>
    public async Task<Users?> GetByRefreshTokenAsync(string refreshToken)
    {
        return await _context.Set<Users>()
            .FirstOrDefaultAsync(u =>
                u.RefreshToken == refreshToken &&
                u.RefreshTokenExpiry > DateTime.UtcNow &&
                u.IsActive);
    }

    public async Task<Users> CreateUserAsync(Users user)
    {
        // 1. Email ve Username benzersizlik kontrolü
        var existingUser = await _context.Set<Users>()
            .FirstOrDefaultAsync(u => u.Username == user.Username || u.Email == user.Email);

        if (existingUser != null)
        {
            if (existingUser.Username == user.Username)
                throw new ArgumentException("Bu kullanıcı adı zaten alınmış.");
            if (existingUser.Email == user.Email)
                throw new ArgumentException("Bu e-posta adresi zaten kullanımda.");
        }

        // 2. Şifre validasyonu (min 8 karakter, 1 büyük, 1 küçük harf)
        if (string.IsNullOrWhiteSpace(user.Password) || user.Password.Length < 8)
            throw new ArgumentException("Şifre en az 8 karakter uzunluğunda olmalıdır.");

        if (!user.Password.Any(char.IsUpper))
            throw new ArgumentException("Şifre en az bir büyük harf içermelidir.");

        if (!user.Password.Any(char.IsLower))
            throw new ArgumentException("Şifre en az bir küçük harf içermelidir.");

        // 3. Şifreyi BCrypt ile hashle — düz metin asla veritabanına kaydedilmez
        user.Password = _passwordHasher.Hash(user.Password);

        user.IsActive   = true;
        user.IsVerified = false;

        await _context.Set<Users>().AddAsync(user);
        await _context.SaveChangesAsync();
        return user;
    }

    // Soft delete
    public new async Task DeleteAsync(int id)
    {
        var user = await _context.Set<Users>().FindAsync(id);
        if (user != null)
        {
            user.IsActive = false;
            _context.Entry(user).State = EntityState.Modified;
            await _context.SaveChangesAsync();
        }
    }

    public new async Task<IEnumerable<Users>> GetAllAsync()
    {
        return await _context.Set<Users>().Where(u => u.IsActive).ToListAsync();
    }
}

