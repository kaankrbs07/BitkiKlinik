using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BitkiKlinik.API.Migrations
{
    /// <inheritdoc />
    public partial class AddDiseaseModelLabel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ModelLabel",
                table: "Diseases",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ModelLabel",
                table: "Diseases");
        }
    }
}
