using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using BitkiKlinik.API.Data;
using BitkiKlinik.API.Services.Interfaces;

namespace BitkiKlinik.API.Services.Implementations;

public class GenericService<T> : IGenericService<T> where T : class
{
    private readonly ApplicationDbContext _context;
    private readonly DbSet<T> _dbSet;

    public GenericService(ApplicationDbContext context)
    {
        _context = context;
        _dbSet = _context.Set<T>();
    }

    public async Task<IEnumerable<T>> GetAllAsync()
    {
        return await _dbSet.ToListAsync();
    }

    public async Task<T?> GetByIdAsync(int id)
    {
        return await _dbSet.FindAsync(id);
    }

    public async Task<IEnumerable<T>> FindAsync(Expression<Func<T, bool>> predicate)
    {
        return await _dbSet.Where(predicate).ToListAsync();
    }

    public async Task<T> AddAsync(T entity)
    {
        await _dbSet.AddAsync(entity);
        await _context.SaveChangesAsync();
        return entity;
    }

    public async Task UpdateAsync(T entity)
    {
        // EntityState.Detached: context bu entity'yi tanımıyor, elle Attach et.
        // Diğer tüm durumlarda (Added, Modified, Unchanged) EF zaten takip ediyor;
        // SaveChangesAsync sadece gerçekten değişen property'leri UPDATE eder.
        var entry = _context.Entry(entity);
        if (entry.State == EntityState.Detached)
        {
            _dbSet.Attach(entity);
            entry.State = EntityState.Modified;
        }

        await _context.SaveChangesAsync();
    }


    public async Task DeleteAsync(int id)
    {
        var entity = await _dbSet.FindAsync(id);
        if (entity != null)
        {
            _dbSet.Remove(entity);
            await _context.SaveChangesAsync();
        }
    }
}
