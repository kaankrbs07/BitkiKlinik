using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;
using Moq.Protected;
using Xunit;
using FluentAssertions;
using BitkiKlinik.API.Services.Implementations;
using BitkiKlinik.API.DTOs;

namespace BitkiKlinik.Tests.Services;

public class GeminiServiceTests : IDisposable
{
    private readonly Mock<IHttpClientFactory> _mockHttpClientFactory;
    private readonly Mock<ILogger<GeminiService>> _mockLogger;
    private readonly Mock<IConfiguration> _mockConfiguration;
    private readonly Mock<HttpMessageHandler> _mockHttpMessageHandler;

    public GeminiServiceTests()
    {
        _mockHttpClientFactory = new Mock<IHttpClientFactory>();
        _mockLogger = new Mock<ILogger<GeminiService>>();
        _mockConfiguration = new Mock<IConfiguration>();
        _mockHttpMessageHandler = new Mock<HttpMessageHandler>(MockBehavior.Strict);

        // Default configurations
        var mockSection = new Mock<IConfigurationSection>();
        mockSection.Setup(s => s["ApiKey"]).Returns("test-api-key");
        mockSection.Setup(s => s["BaseUrl"]).Returns("https://generativelanguage.googleapis.com");
        mockSection.Setup(s => s["Model"]).Returns("gemini-3.5-flash");

        _mockConfiguration.Setup(c => c.GetSection("Gemini")).Returns(mockSection.Object);

        // Setup HttpClient creation
        var httpClient = new HttpClient(_mockHttpMessageHandler.Object);
        _mockHttpClientFactory.Setup(f => f.CreateClient(It.IsAny<string>())).Returns(httpClient);

        // Reset the static unhealthy models state before each test
        GeminiService.ClearUnhealthyModelsForTesting();
    }

    public void Dispose()
    {
        GeminiService.ClearUnhealthyModelsForTesting();
    }

    [Fact]
    public async Task GenerateChatResponseAsync_ShouldReturnResponse_WhenModelSucceeds()
    {
        // Arrange
        var responseJson = @"{
            ""candidates"": [
                {
                    ""content"": {
                        ""parts"": [
                            {
                                ""text"": ""Hello from Gemini 3.5""
                            }
                        ]
                    }
                }
            ]
        }";

        _mockHttpMessageHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.Is<HttpRequestMessage>(req => req.RequestUri!.ToString().Contains("gemini-3.5-flash")),
                ItExpr.IsAny<CancellationToken>()
            )
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent(responseJson)
            });

        var service = new GeminiService(_mockHttpClientFactory.Object, _mockConfiguration.Object, _mockLogger.Object);
        var chatHistory = new List<ChatMessageDTO> { new() { Role = "user", Content = "Hi" } };

        // Act
        var result = await service.GenerateChatResponseAsync("System prompt", chatHistory);

        // Assert
        result.Should().Be("Hello from Gemini 3.5");
        
        _mockHttpMessageHandler.Protected().Verify(
            "SendAsync",
            Times.Once(),
            ItExpr.Is<HttpRequestMessage>(req => req.RequestUri!.ToString().Contains("gemini-3.5-flash")),
            ItExpr.IsAny<CancellationToken>()
        );
    }

    [Fact]
    public async Task GenerateChatResponseAsync_ShouldFallbackToNextModel_WhenPrimaryModelFails()
    {
        // Arrange
        var responseJsonSuccess = @"{
            ""candidates"": [
                {
                    ""content"": {
                        ""parts"": [
                            {
                                ""text"": ""Hello from Gemini 3.1 Flash Lite""
                            }
                        ]
                    }
                }
            ]
        }";

        // Mock 3.5-flash to fail
        _mockHttpMessageHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.Is<HttpRequestMessage>(req => req.RequestUri!.ToString().Contains("gemini-3.5-flash")),
                ItExpr.IsAny<CancellationToken>()
            )
            .ThrowsAsync(new TaskCanceledException("Timeout"));

        // Mock 3.1-flash-lite to succeed
        _mockHttpMessageHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.Is<HttpRequestMessage>(req => req.RequestUri!.ToString().Contains("gemini-3.1-flash-lite")),
                ItExpr.IsAny<CancellationToken>()
            )
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent(responseJsonSuccess)
            });

        var service = new GeminiService(_mockHttpClientFactory.Object, _mockConfiguration.Object, _mockLogger.Object);
        var chatHistory = new List<ChatMessageDTO> { new() { Role = "user", Content = "Hi" } };

        // Act
        var result = await service.GenerateChatResponseAsync("System prompt", chatHistory);

        // Assert
        result.Should().Be("Hello from Gemini 3.1 Flash Lite");

        // Verify both were called (3.5-flash tried and failed, then 3.1-flash-lite succeeded)
        _mockHttpMessageHandler.Protected().Verify(
            "SendAsync",
            Times.Once(),
            ItExpr.Is<HttpRequestMessage>(req => req.RequestUri!.ToString().Contains("gemini-3.5-flash")),
            ItExpr.IsAny<CancellationToken>()
        );

        _mockHttpMessageHandler.Protected().Verify(
            "SendAsync",
            Times.Once(),
            ItExpr.Is<HttpRequestMessage>(req => req.RequestUri!.ToString().Contains("gemini-3.1-flash-lite")),
            ItExpr.IsAny<CancellationToken>()
        );
    }

    [Fact]
    public async Task GenerateChatResponseAsync_ShouldSkipUnhealthyModels_OnSubsequentCalls()
    {
        // Arrange
        var responseJsonSuccess = @"{
            ""candidates"": [
                {
                    ""content"": {
                        ""parts"": [
                            {
                                ""text"": ""Success response""
                            }
                        ]
                    }
                }
            ]
        }";

        // FIRST CALL Setup: 3.5-flash fails, 3.1-flash-lite succeeds
        _mockHttpMessageHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.Is<HttpRequestMessage>(req => req.RequestUri!.ToString().Contains("gemini-3.5-flash")),
                ItExpr.IsAny<CancellationToken>()
            )
            .ThrowsAsync(new TaskCanceledException("Timeout"));

        _mockHttpMessageHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.Is<HttpRequestMessage>(req => req.RequestUri!.ToString().Contains("gemini-3.1-flash-lite")),
                ItExpr.IsAny<CancellationToken>()
            )
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent(responseJsonSuccess)
            });

        var service = new GeminiService(_mockHttpClientFactory.Object, _mockConfiguration.Object, _mockLogger.Object);
        var chatHistory = new List<ChatMessageDTO> { new() { Role = "user", Content = "Hi" } };

        // FIRST CALL: Act
        var result1 = await service.GenerateChatResponseAsync("System prompt", chatHistory);
        result1.Should().Be("Success response");

        // Verify 3.5-flash was called and failed
        _mockHttpMessageHandler.Protected().Verify(
            "SendAsync",
            Times.Once(),
            ItExpr.Is<HttpRequestMessage>(req => req.RequestUri!.ToString().Contains("gemini-3.5-flash")),
            ItExpr.IsAny<CancellationToken>()
        );

        // Reset Mock invocations count but keep setups
        _mockHttpMessageHandler.Invocations.Clear();

        // SECOND CALL: Act
        var result2 = await service.GenerateChatResponseAsync("System prompt", chatHistory);
        result2.Should().Be("Success response");

        // Verify that on the second call, gemini-3.5-flash was skipped completely (not called at all)
        _mockHttpMessageHandler.Protected().Verify(
            "SendAsync",
            Times.Never(),
            ItExpr.Is<HttpRequestMessage>(req => req.RequestUri!.ToString().Contains("gemini-3.5-flash")),
            ItExpr.IsAny<CancellationToken>()
        );

        _mockHttpMessageHandler.Protected().Verify(
            "SendAsync",
            Times.Once(),
            ItExpr.Is<HttpRequestMessage>(req => req.RequestUri!.ToString().Contains("gemini-3.1-flash-lite")),
            ItExpr.IsAny<CancellationToken>()
        );
    }

    [Fact]
    public async Task GenerateChatResponseAsync_ShouldFailOpen_WhenAllModelsAreUnhealthy()
    {
        // Arrange
        var responseJsonSuccess = @"{
            ""candidates"": [
                {
                    ""content"": {
                        ""parts"": [
                            {
                                ""text"": ""Fail-open success""
                            }
                        ]
                    }
                }
            ]
        }";

        var service = new GeminiService(_mockHttpClientFactory.Object, _mockConfiguration.Object, _mockLogger.Object);
        var chatHistory = new List<ChatMessageDTO> { new() { Role = "user", Content = "Hi" } };

        // Mock all three models to fail once, marking them unhealthy
        _mockHttpMessageHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>()
            )
            .ThrowsAsync(new TaskCanceledException("Timeout"));

        // Trigger failures to put all models in unhealthy state
        await Assert.ThrowsAsync<TaskCanceledException>(() => service.GenerateChatResponseAsync("System prompt", chatHistory));

        // Now all models are unhealthy. Reset handler invocations and setup a successful response for the first model.
        _mockHttpMessageHandler.Invocations.Clear();
        _mockHttpMessageHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.Is<HttpRequestMessage>(req => req.RequestUri!.ToString().Contains("gemini-3.5-flash")),
                ItExpr.IsAny<CancellationToken>()
            )
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent(responseJsonSuccess)
            });

        // Act: Should fail open and try the first model again, despite being marked unhealthy
        var result = await service.GenerateChatResponseAsync("System prompt", chatHistory);

        // Assert
        result.Should().Be("Fail-open success");
        
        _mockHttpMessageHandler.Protected().Verify(
            "SendAsync",
            Times.Once(),
            ItExpr.Is<HttpRequestMessage>(req => req.RequestUri!.ToString().Contains("gemini-3.5-flash")),
            ItExpr.IsAny<CancellationToken>()
        );
    }
}
