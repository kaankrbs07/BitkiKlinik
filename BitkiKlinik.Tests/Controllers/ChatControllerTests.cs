using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;
using FluentAssertions;
using BitkiKlinik.API.Controllers;
using BitkiKlinik.API.Data;
using BitkiKlinik.API.Models;
using BitkiKlinik.API.Services.Interfaces;

namespace BitkiKlinik.Tests.Controllers;

public class ChatControllerTests : IDisposable
{
    private readonly ApplicationDbContext _db;
    private readonly Mock<IScanService> _mockScanService;
    private readonly Mock<IDiseaseService> _mockDiseaseService;
    private readonly Mock<ITreatmentService> _mockTreatmentService;
    private readonly Mock<IGeminiService> _mockGeminiService;
    private readonly Mock<ILogger<ChatController>> _mockLogger;
    private readonly Mock<IMemoryCache> _mockCache;
    private readonly ChatController _sut;

    public ChatControllerTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _db = new ApplicationDbContext(options);

        _mockScanService = new Mock<IScanService>();
        _mockDiseaseService = new Mock<IDiseaseService>();
        _mockTreatmentService = new Mock<ITreatmentService>();
        _mockGeminiService = new Mock<IGeminiService>();
        _mockLogger = new Mock<ILogger<ChatController>>();
        _mockCache = new Mock<IMemoryCache>();

        // Set up controller with authenticated user context
        var user = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, "1"),
            new Claim(ClaimTypes.Name, "testuser")
        }, "mock"));

        _sut = new ChatController(
            _db,
            _mockScanService.Object,
            _mockDiseaseService.Object,
            _mockTreatmentService.Object,
            _mockGeminiService.Object,
            _mockLogger.Object,
            _mockCache.Object
        )
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = user }
            }
        };
    }

    [Fact]
    public async Task DeleteChatSession_EmptySessionId_ReturnsBadRequest()
    {
        // Act
        var result = await _sut.DeleteChatSession(string.Empty);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task DeleteChatSession_SessionNotFound_ReturnsNotFound()
    {
        // Act
        var result = await _sut.DeleteChatSession("non-existent-session-id");

        // Assert
        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task DeleteChatSession_ValidSessionId_MarksMessagesAsInactiveAndReturnsOk()
    {
        // Arrange
        var sessionId = "active-session-id";
        var messages = new List<ChatMessage>
        {
            new() { UserId = 1, SessionId = sessionId, Content = "Hello", Role = "user", IsActive = true },
            new() { UserId = 1, SessionId = sessionId, Content = "Hi there", Role = "model", IsActive = true }
        };

        _db.ChatMessages.AddRange(messages);
        await _db.SaveChangesAsync();

        // Act
        var result = await _sut.DeleteChatSession(sessionId);

        // Assert
        Assert.IsType<OkObjectResult>(result);

        // Check DB directly (ignoring EF Core Global Query Filter)
        var messagesInDb = await _db.ChatMessages
            .IgnoreQueryFilters()
            .ToListAsync();

        messagesInDb.Should().HaveCount(2);
        messagesInDb.Should().AllSatisfy(m => m.IsActive.Should().BeFalse());
    }

    [Fact]
    public async Task DeleteChatSession_GlobalQueryFilter_HidesDeletedMessagesFromStandardQueries()
    {
        // Arrange
        var sessionId = "deleted-session-id";
        var messages = new List<ChatMessage>
        {
            new() { UserId = 1, SessionId = sessionId, Content = "Hello", Role = "user", IsActive = false },
            new() { UserId = 1, SessionId = sessionId, Content = "Hi there", Role = "model", IsActive = false }
        };

        _db.ChatMessages.AddRange(messages);
        await _db.SaveChangesAsync();

        // Act & Assert
        // A standard query should return 0 because IsActive == false is automatically filtered
        var activeMessages = await _db.ChatMessages.ToListAsync();
        activeMessages.Should().BeEmpty();
    }

    public void Dispose() => _db.Dispose();
}
