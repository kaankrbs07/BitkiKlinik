using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using BitkiKlinik.API.Services.Implementations;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace BitkiKlinik.Tests.Services;

public class FileStorageValidationTests
{
    private static IFormFile CreateMockFormFile(byte[] content, string fileName = "test.jpg")
    {
        var stream = new MemoryStream(content);
        var mockFile = new Mock<IFormFile>();
        mockFile.Setup(f => f.OpenReadStream()).Returns(stream);
        mockFile.Setup(f => f.FileName).Returns(fileName);
        mockFile.Setup(f => f.Length).Returns(content.Length);
        return mockFile.Object;
    }

    private static LocalFileStorageService CreateServiceInstance(string maxFileSizeMb = "10", string[]? allowedExtensions = null)
    {
        var mockEnv = new Mock<IWebHostEnvironment>();
        mockEnv.Setup(e => e.ContentRootPath).Returns(Directory.GetCurrentDirectory());

        allowedExtensions ??= new[] { ".jpg", ".jpeg", ".png", ".webp" };
        var inMemorySettings = new Dictionary<string, string?>
        {
            { "FileStorage:MaxFileSizeMb", maxFileSizeMb },
            { "FileStorage:BasePath", "wwwroot/uploads" }
        };

        for (int i = 0; i < allowedExtensions.Length; i++)
        {
            inMemorySettings[$"FileStorage:AllowedExtensions:{i}"] = allowedExtensions[i];
        }

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(inMemorySettings)
            .Build();

        return new LocalFileStorageService(
            mockEnv.Object,
            configuration,
            NullLogger<LocalFileStorageService>.Instance
        );
    }

    #region ValidateImageSignature Tests

    [Fact]
    public void ValidateImageSignature_ValidJpeg_DoesNotThrow()
    {
        // Arrange: JPEG starts with FF D8 FF
        byte[] jpegBytes = { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01 };
        var file = CreateMockFormFile(jpegBytes, "image.jpg");

        // Act & Assert
        Action act = () => LocalFileStorageService.ValidateImageSignature(file);
        act.Should().NotThrow();
    }

    [Fact]
    public void ValidateImageSignature_ValidPng_DoesNotThrow()
    {
        // Arrange: PNG starts with 89 50 4E 47 0D 0A 1A 0A
        byte[] pngBytes = { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D };
        var file = CreateMockFormFile(pngBytes, "image.png");

        // Act & Assert
        Action act = () => LocalFileStorageService.ValidateImageSignature(file);
        act.Should().NotThrow();
    }

    [Fact]
    public void ValidateImageSignature_ValidWebP_DoesNotThrow()
    {
        // Arrange: WebP starts with RIFF (52 49 46 46) and WEBP (57 45 42 50) at offset 8
        byte[] webpBytes = {
            0x52, 0x49, 0x46, 0x46, // RIFF
            0x1A, 0x00, 0x00, 0x00, // Chunk size
            0x57, 0x45, 0x42, 0x50  // WEBP
        };
        var file = CreateMockFormFile(webpBytes, "image.webp");

        // Act & Assert
        Action act = () => LocalFileStorageService.ValidateImageSignature(file);
        act.Should().NotThrow();
    }

    [Fact]
    public void ValidateImageSignature_ValidGif_DoesNotThrow()
    {
        // Arrange: GIF starts with GIF87a or GIF89a (47 49 46 38)
        byte[] gifBytes = { 0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80 };
        var file = CreateMockFormFile(gifBytes, "image.gif");

        // Act & Assert
        Action act = () => LocalFileStorageService.ValidateImageSignature(file);
        act.Should().NotThrow();
    }

    [Fact]
    public void ValidateImageSignature_RiffHeaderButNotWebp_ThrowsArgumentException()
    {
        // Arrange: Starts with RIFF but has AVI/WAV type instead of WEBP
        byte[] riffAviBytes = {
            0x52, 0x49, 0x46, 0x46, // RIFF
            0x1A, 0x00, 0x00, 0x00, // Chunk size
            0x41, 0x56, 0x49, 0x20  // AVI 
        };
        var file = CreateMockFormFile(riffAviBytes, "video.avi");

        // Act
        Action act = () => LocalFileStorageService.ValidateImageSignature(file);

        // Assert
        act.Should().Throw<ArgumentException>()
            .WithMessage("*görsel formatıyla eşleşmiyor*");
    }

    [Fact]
    public void ValidateImageSignature_FileTooShortForSignature_ThrowsArgumentException()
    {
        // Arrange: 5 bytes long, doesn't match JPEG (3 bytes but different values) or PNG
        byte[] shortBytes = { 0x11, 0x22, 0x33, 0x44, 0x55 };
        var file = CreateMockFormFile(shortBytes, "short.bin");

        // Act
        Action act = () => LocalFileStorageService.ValidateImageSignature(file);

        // Assert
        act.Should().Throw<ArgumentException>()
            .WithMessage("*görsel formatıyla eşleşmiyor*");
    }

    [Fact]
    public void ValidateImageSignature_InvalidSignature_ThrowsArgumentException()
    {
        // Arrange: Fake text file masked as jpg
        byte[] textBytes = Encoding.UTF8.GetBytes("<?php phpinfo(); ?>");
        var file = CreateMockFormFile(textBytes, "shell.php.jpg");

        // Act
        Action act = () => LocalFileStorageService.ValidateImageSignature(file);

        // Assert
        act.Should().Throw<ArgumentException>()
            .WithMessage("*görsel formatıyla eşleşmiyor*");
    }

    [Fact]
    public void ValidateImageSignature_EmptyFile_ThrowsArgumentException()
    {
        // Arrange
        byte[] emptyBytes = Array.Empty<byte>();
        var file = CreateMockFormFile(emptyBytes, "empty.jpg");

        // Act
        Action act = () => LocalFileStorageService.ValidateImageSignature(file);

        // Assert
        act.Should().Throw<ArgumentException>()
            .WithMessage("*içeriği okunamıyor*");
    }

    #endregion

    #region ValidateFile Outer Rules Tests

    [Fact]
    public void ValidateFile_NullFile_ThrowsArgumentException()
    {
        // Arrange
        var service = CreateServiceInstance();

        // Act
        Action act = () => service.ValidateFile(null!);

        // Assert
        act.Should().Throw<ArgumentException>()
            .WithMessage("*boş olamaz*");
    }

    [Fact]
    public void ValidateFile_EmptyFile_ThrowsArgumentException()
    {
        // Arrange
        var service = CreateServiceInstance();
        var emptyFile = CreateMockFormFile(Array.Empty<byte>(), "empty.jpg");

        // Act
        Action act = () => service.ValidateFile(emptyFile);

        // Assert
        act.Should().Throw<ArgumentException>()
            .WithMessage("*boş olamaz*");
    }

    [Fact]
    public void ValidateFile_FileTooLarge_ThrowsArgumentException()
    {
        // Arrange: Max size 1 MB
        var service = CreateServiceInstance(maxFileSizeMb: "1");
        // Create 2 MB content
        byte[] largeBytes = new byte[2 * 1024 * 1024];
        var largeFile = CreateMockFormFile(largeBytes, "large.jpg");

        // Act
        Action act = () => service.ValidateFile(largeFile);

        // Assert
        act.Should().Throw<ArgumentException>()
            .WithMessage("*boyutu*sınırını aşıyor*");
    }

    [Fact]
    public void ValidateFile_DisallowedExtension_ThrowsArgumentException()
    {
        // Arrange
        var service = CreateServiceInstance();
        byte[] jpegBytes = { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10 };
        var file = CreateMockFormFile(jpegBytes, "danger.exe");

        // Act
        Action act = () => service.ValidateFile(file);

        // Assert
        act.Should().Throw<ArgumentException>()
            .WithMessage("*Desteklenmeyen dosya türü*");
    }

    [Fact]
    public void ValidateFile_ValidFileAndSignature_DoesNotThrow()
    {
        // Arrange
        var service = CreateServiceInstance();
        byte[] pngBytes = { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D };
        var file = CreateMockFormFile(pngBytes, "image.png");

        // Act
        Action act = () => service.ValidateFile(file);

        // Assert
        act.Should().NotThrow();
    }

    #endregion

    #region Save & Delete Physical File Tests

    [Fact]
    public async Task SaveFileAsync_ValidFile_SavesToDiskAndReturnsRelativeUrl()
    {
        // Arrange
        var service = CreateServiceInstance();
        byte[] pngBytes = { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D };
        var file = CreateMockFormFile(pngBytes, "image.png");
        string subDirectory = "test_scans";

        // Act
        string relativeUrl = await service.SaveFileAsync(file, subDirectory);

        // Assert
        relativeUrl.Should().StartWith("/uploads/test_scans/");
        relativeUrl.Should().EndWith(".png");

        // Verify the file was written to disk
        string physicalPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", relativeUrl.TrimStart('/'));
        File.Exists(physicalPath).Should().BeTrue();

        // Cleanup
        if (File.Exists(physicalPath))
        {
            File.Delete(physicalPath);
        }
        string directoryPath = Path.GetDirectoryName(physicalPath)!;
        if (Directory.Exists(directoryPath))
        {
            Directory.Delete(directoryPath, recursive: true);
        }
    }

    [Fact]
    public void DeleteFile_FileExists_DeletesFileFromDisk()
    {
        // Arrange
        var service = CreateServiceInstance();
        string relativeUrl = "/uploads/test_delete/test_file.png";
        string physicalPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads", "test_delete", "test_file.png");

        // Create the directory and file physically
        Directory.CreateDirectory(Path.GetDirectoryName(physicalPath)!);
        File.WriteAllText(physicalPath, "dummy content");
        File.Exists(physicalPath).Should().BeTrue();

        // Act
        service.DeleteFile(relativeUrl);

        // Assert
        File.Exists(physicalPath).Should().BeFalse();

        // Cleanup directory
        string directoryPath = Path.GetDirectoryName(physicalPath)!;
        if (Directory.Exists(directoryPath))
        {
            Directory.Delete(directoryPath, recursive: true);
        }
    }

    [Fact]
    public void DeleteFile_FileDoesNotExist_DoesNotThrow()
    {
        // Arrange
        var service = CreateServiceInstance();
        string nonExistentUrl = "/uploads/non_existent/file.png";

        // Act
        Action act = () => service.DeleteFile(nonExistentUrl);

        // Assert
        act.Should().NotThrow();
    }

    #endregion
}
