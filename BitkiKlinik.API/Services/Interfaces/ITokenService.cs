using BitkiKlinik.API.Models;

using BitkiKlinik.API.DTOs;

namespace BitkiKlinik.API.Services.Interfaces;

public interface ITokenService
{
    AuthDTO CreateToken(Users user);
}
