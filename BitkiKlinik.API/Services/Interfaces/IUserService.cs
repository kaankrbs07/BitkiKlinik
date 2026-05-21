using BitkiKlinik.API.Models;

namespace BitkiKlinik.API.Services.Interfaces;

public interface IUserService : IGenericService<Users>
{
    // Özel User metodlarını (örneğin kullanıcı adı ile sorgulama) buraya ekleyebilirsiniz.
    Task<Users?> GetByUsernameAsync(string username);
    Task<Users?> GetByEmailAsync(string email);
    Task<Users> CreateUserAsync(Users user);
}
