using System;
using System.IO;
using System.Text;
using BitkiKlinik.API.Services.Implementations;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
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
}
