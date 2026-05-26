using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BitkiKlinik.API.Migrations
{
    /// <inheritdoc />
    public partial class AddDiseaseRiskAlertsAndUserLocationFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ExpoPushToken",
                table: "Users",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "Latitude",
                table: "Users",
                type: "float",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "Longitude",
                table: "Users",
                type: "float",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "DiseaseRiskAlerts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    DiseaseName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    RiskPercentage = table.Column<float>(type: "real", nullable: false),
                    RiskLevel = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Suggestion = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    CalculatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DiseaseRiskAlerts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DiseaseRiskAlerts_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DiseaseRiskAlerts_UserId",
                table: "DiseaseRiskAlerts",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DiseaseRiskAlerts");

            migrationBuilder.DropColumn(
                name: "ExpoPushToken",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Latitude",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Longitude",
                table: "Users");
        }
    }
}
