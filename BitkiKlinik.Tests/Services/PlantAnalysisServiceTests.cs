using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using BitkiKlinik.API.DTOs;
using BitkiKlinik.API.Services.Implementations;
using BitkiKlinik.API.Services.Interfaces;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Moq.Protected;
using Xunit;

namespace BitkiKlinik.Tests.Services;

public class PlantAnalysisServiceTests
{
    private readonly Mock<IHttpClientFactory> _mockHttpFactory;
    private readonly Mock<IWebHostEnvironment> _mockEnv;
    private readonly Mock<IConfiguration> _mockConfig;
    private readonly Mock<IActiveLearningService> _mockActiveLearning;
    private readonly Mock<IFileStorageService> _mockFileStorage;
    private readonly PlantAnalysisService _sut;

    public PlantAnalysisServiceTests()
    {
        _mockHttpFactory = new Mock<IHttpClientFactory>();
        _mockEnv = new Mock<IWebHostEnvironment>();
        _mockConfig = new Mock<IConfiguration>();
        _mockActiveLearning = new Mock<IActiveLearningService>();
        _mockFileStorage = new Mock<IFileStorageService>();

        var pythonSectionMock = new Mock<IConfigurationSection>();
        pythonSectionMock.Setup(s => s["AnalyzeEndpoint"]).Returns("/analyze");
        _mockConfig.Setup(c => c.GetSection("PythonApi")).Returns(pythonSectionMock.Object);

        _sut = new PlantAnalysisService(
            _mockHttpFactory.Object,
            _mockEnv.Object,
            _mockConfig.Object,
            NullLogger<PlantAnalysisService>.Instance,
            _mockActiveLearning.Object,
            _mockFileStorage.Object
        );
    }

    private static IFormFile CreateMockImage()
    {
        // Valid JPEG magic number
        byte[] jpegBytes = { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01 };
        var stream = new MemoryStream(jpegBytes);
        var mockFile = new Mock<IFormFile>();
        mockFile.Setup(f => f.OpenReadStream()).Returns(stream);
        mockFile.Setup(f => f.FileName).Returns("test.jpg");
        mockFile.Setup(f => f.Length).Returns(jpegBytes.Length);
        mockFile.Setup(f => f.ContentType).Returns("image/jpeg");
        return mockFile.Object;
    }

    [Fact]
    public async Task AnalyzeAsync_SuccessfulPythonApiResponse_ReturnsResult()
    {
        // Arrange
        var mockImage = CreateMockImage();
        _mockFileStorage
            .Setup(s => s.SaveFileAsync(mockImage, "scans"))
            .ReturnsAsync("/uploads/scans/test-uuid.jpg");

        var pythonResponseDto = new PythonAnalysisResponseDTO
        {
            Disease = "Healthy",
            Confidence = 0.95f
        };
        var responseMessage = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(JsonSerializer.Serialize(pythonResponseDto))
        };

        var mockHttpMessageHandler = new Mock<HttpMessageHandler>();
        mockHttpMessageHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>()
            )
            .ReturnsAsync(responseMessage);

        var httpClient = new HttpClient(mockHttpMessageHandler.Object)
        {
            BaseAddress = new Uri("http://localhost:8000")
        };

        _mockHttpFactory.Setup(f => f.CreateClient("PythonApiClient")).Returns(httpClient);

        // Act
        var result = await _sut.AnalyzeAsync(mockImage);

        // Assert
        Assert.NotNull(result);
        result.ModelLabel.Should().Be("Healthy");
        result.Confidence.Should().Be(0.95f);
        result.ImageUrl.Should().Be("/uploads/scans/test-uuid.jpg");

        _mockFileStorage.Verify(s => s.ValidateFile(mockImage), Times.Once);
        _mockFileStorage.Verify(s => s.SaveFileAsync(mockImage, "scans"), Times.Once);
    }

    [Fact]
    public async Task AnalyzeAsync_PythonApiFails_ThrowsHttpRequestException()
    {
        // Arrange
        var mockImage = CreateMockImage();
        _mockFileStorage.Setup(s => s.SaveFileAsync(mockImage, "scans")).ReturnsAsync("/uploads/scans/test.jpg");

        var responseMessage = new HttpResponseMessage(HttpStatusCode.InternalServerError)
        {
            Content = new StringContent("Internal Server Error")
        };

        var mockHttpMessageHandler = new Mock<HttpMessageHandler>();
        mockHttpMessageHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>()
            )
            .ReturnsAsync(responseMessage);

        var httpClient = new HttpClient(mockHttpMessageHandler.Object)
        {
            BaseAddress = new Uri("http://localhost:8000")
        };
        _mockHttpFactory.Setup(f => f.CreateClient("PythonApiClient")).Returns(httpClient);

        // Act
        Func<Task> act = async () => await _sut.AnalyzeAsync(mockImage);

        // Assert
        await act.Should().ThrowAsync<HttpRequestException>()
            .WithMessage("*Analiz servisi hata döndürdü*");
    }
}
